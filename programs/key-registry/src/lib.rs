use anchor_lang::prelude::*;

declare_id!("3emebPATdE5JTXp7TckzZKbNUhFMka7LdRbeCqpscHc1crpKBZ96Ry9BGbs94fzXRNc5FhVTLQGEsdoPzS2tbDmH");

#[program]
pub mod key_registry {
    use super::*;

    /// Register a new username for the caller's public key
    pub fn register_username(
        ctx: Context<RegisterUsername>,
        username: String,
        encryption_key: [u8; 32],
    ) -> Result<()> {
        // Validate username
        require!(
            username.len() >= 3 && username.len() <= 20,
            KeyError::InvalidUsernameLength
        );
        require!(
            username
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_'),
            KeyError::InvalidUsernameCharacters
        );

        // Initialize the username account
        let user_account = &mut ctx.accounts.user_account;
        user_account.owner = ctx.accounts.owner.key();
        user_account.username = username.to_lowercase();
        user_account.created_at = Clock::get()?.unix_timestamp;
        user_account.bump = ctx.bumps.user_account;
        user_account.encryption_key = encryption_key;

        msg!(
            "Username @{} registered for {}",
            username,
            ctx.accounts.owner.key()
        );

        Ok(())
    }

    /// Lookup a username to get the owner's public key
    pub fn lookup_username(_ctx: Context<LookupUsername>) -> Result<()> {
        // The account data is returned automatically by Anchor
        // This instruction is mainly for on-chain verification
        Ok(())
    }

    /// Transfer username ownership (optional - for future use)
    pub fn transfer_username(ctx: Context<TransferUsername>, new_owner: Pubkey) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;

        require!(
            user_account.owner == ctx.accounts.current_owner.key(),
            KeyError::NotOwner
        );

        user_account.owner = new_owner;

        msg!(
            "Username @{} transferred from {} to {}",
            user_account.username,
            ctx.accounts.current_owner.key(),
            new_owner
        );

        Ok(())
    }

    /// Close/release a username account
    /// The rent lamports are returned to the owner
    /// This allows the username to be claimed by someone else
    pub fn close_account(ctx: Context<CloseAccount>, _username: String) -> Result<()> {
        let user_account = &ctx.accounts.user_account;

        require!(
            user_account.owner == ctx.accounts.owner.key(),
            KeyError::NotOwner
        );

        msg!(
            "Username @{} released by {}",
            user_account.username,
            ctx.accounts.owner.key()
        );

        // Account will be closed automatically by Anchor's close constraint
        Ok(())
    }
    pub fn update_encryption_key(
        ctx: Context<UpdateEncryptionKey>,
        new_encryption_key: [u8; 32],
    ) -> Result<()> {
        let user_account = &mut ctx.accounts.user_account;

        require!(
            user_account.owner == ctx.accounts.owner.key(),
            KeyError::NotOwner
        );

        user_account.encryption_key = new_encryption_key;

        msg!("Encryption key updated for @{}", user_account.username);
        Ok(())
    }

    // ========================================================================
    // Group Chat Instructions
    // ========================================================================

    /// Create a new group (public or private)
    #[allow(clippy::too_many_arguments)]
    pub fn create_group(
        ctx: Context<CreateGroup>,
        group_id: [u8; 32],
        name: String,
        description: String,
        is_public: bool,
        is_searchable: bool,
        invite_only: bool,
        max_members: u16,
        allow_member_invites: bool,
        group_encryption_key: [u8; 32],
    ) -> Result<()> {
        // Validate group name
        require!(
            !name.is_empty() && name.len() <= 100,
            GroupError::InvalidGroupNameLength
        );

        // Validate description
        require!(
            description.len() <= 500,
            GroupError::InvalidGroupDescriptionLength
        );

        // Initialize group account
        let group = &mut ctx.accounts.group_account;
        group.owner = ctx.accounts.owner.key();
        group.group_id = group_id;
        group.public_code = String::new(); // Set via set_group_code if needed
        group.name = name.clone();
        group.description = description;
        group.avatar_arweave_id = String::new();
        group.is_public = is_public;
        group.is_searchable = is_searchable;
        group.invite_only = invite_only;
        group.max_members = max_members;
        group.allow_member_invites = allow_member_invites;
        group.require_approval = false;
        group.enable_replies = true;
        group.enable_reactions = true;
        group.enable_read_receipts = true;
        group.enable_typing_indicators = true;
        group.group_encryption_key = group_encryption_key;
        group.member_count = 1; // Owner is first member
        group.created_at = Clock::get()?.unix_timestamp;
        group.updated_at = Clock::get()?.unix_timestamp;
        group.bump = ctx.bumps.group_account;

        // Initialize owner as first member with Owner role
        let owner_member = &mut ctx.accounts.owner_member_account;
        owner_member.group_id = group_id;
        owner_member.member = ctx.accounts.owner.key();
        owner_member.role = GroupRole::Owner;
        owner_member.permissions = 0xFFFF; // All permissions
        owner_member.encrypted_group_key = [0u8; 64]; // Owner has the key, no need to encrypt
        owner_member.joined_at = Clock::get()?.unix_timestamp;
        owner_member.last_read_at = 0;
        owner_member.is_active = true;
        owner_member.is_muted = false;
        owner_member.is_banned = false;
        owner_member.invited_by = ctx.accounts.owner.key(); // Self-invited
        owner_member.bump = ctx.bumps.owner_member_account;

        msg!(
            "Group created: '{}' by {} (public: {})",
            name,
            ctx.accounts.owner.key(),
            is_public
        );

        Ok(())
    }

    /// Set or update a public code for a group
    pub fn set_group_code(
        ctx: Context<SetGroupCode>,
        _group_id: [u8; 32],
        public_code: String,
    ) -> Result<()> {
        // Validate public code
        require!(
            public_code.len() >= 3 && public_code.len() <= 20,
            GroupError::InvalidPublicCodeLength
        );
        require!(
            public_code
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-'),
            GroupError::InvalidPublicCodeCharacters
        );

        // Update group account
        let group = &mut ctx.accounts.group_account;
        group.public_code = public_code.clone();

        // Initialize lookup account
        let lookup = &mut ctx.accounts.group_code_lookup;
        lookup.public_code = public_code.to_lowercase();
        lookup.group_id = group.group_id;
        lookup.bump = ctx.bumps.group_code_lookup;

        msg!("Public code '{}' set for group", lookup.public_code);

        Ok(())
    }

    /// Join a group (via public code or direct invite)
    pub fn join_group(
        ctx: Context<JoinGroup>,
        group_id: [u8; 32],
        encrypted_group_key: [u8; 64],
    ) -> Result<()> {
        let group = &mut ctx.accounts.group_account;
        let member = &mut ctx.accounts.member_account;

        // Check if group has space
        require!(
            group.max_members == 0 || group.member_count < group.max_members,
            GroupError::GroupFull
        );

        // Initialize member account
        member.group_id = group_id;
        member.member = ctx.accounts.new_member.key();
        member.role = GroupRole::Member;
        member.permissions = PERM_SEND_MESSAGES;
        member.encrypted_group_key = encrypted_group_key;
        member.joined_at = Clock::get()?.unix_timestamp;
        member.last_read_at = 0;
        member.is_active = true;
        member.is_muted = false;
        member.is_banned = false;
        member.invited_by = ctx.accounts.new_member.key(); // Will be overridden if invited
        member.bump = ctx.bumps.member_account;

        // Increment member count
        group.member_count += 1;
        group.updated_at = Clock::get()?.unix_timestamp;

        msg!(
            "Member {} joined group (member count: {})",
            ctx.accounts.new_member.key(),
            group.member_count
        );

        Ok(())
    }

    /// Leave a group voluntarily
    pub fn leave_group(ctx: Context<LeaveGroup>, _group_id: [u8; 32]) -> Result<()> {
        let group = &mut ctx.accounts.group_account;
        let member = &ctx.accounts.member_account;

        // Cannot leave if you're the owner
        require!(
            member.role != GroupRole::Owner,
            GroupError::OwnerCannotLeave
        );

        // Decrement member count
        group.member_count = group.member_count.saturating_sub(1);
        group.updated_at = Clock::get()?.unix_timestamp;

        msg!(
            "Member {} left group (member count: {})",
            ctx.accounts.member.key(),
            group.member_count
        );

        // Account will be closed automatically by Anchor's close constraint
        Ok(())
    }

    /// Invite a specific user to the group
    pub fn invite_member(
        ctx: Context<InviteMember>,
        group_id: [u8; 32],
        encrypted_group_key: [u8; 64],
    ) -> Result<()> {
        let group = &mut ctx.accounts.group_account;
        let inviter_member = &ctx.accounts.inviter_member_account;
        let invited_member = &mut ctx.accounts.invited_member_account;

        // Check if inviter has permission
        let can_invite = inviter_member.role == GroupRole::Owner
            || inviter_member.role == GroupRole::Admin
            || inviter_member.role == GroupRole::Moderator
            || (group.allow_member_invites
                && inviter_member.permissions & PERM_INVITE_MEMBERS != 0);

        require!(can_invite, GroupError::InsufficientPermissions);

        // Check if group has space
        require!(
            group.max_members == 0 || group.member_count < group.max_members,
            GroupError::GroupFull
        );

        // Initialize invited member account
        invited_member.group_id = group_id;
        invited_member.member = ctx.accounts.invited_user.key();
        invited_member.role = GroupRole::Member;
        invited_member.permissions = PERM_SEND_MESSAGES;
        invited_member.encrypted_group_key = encrypted_group_key;
        invited_member.joined_at = Clock::get()?.unix_timestamp;
        invited_member.last_read_at = 0;
        invited_member.is_active = true;
        invited_member.is_muted = false;
        invited_member.is_banned = false;
        invited_member.invited_by = ctx.accounts.inviter.key();
        invited_member.bump = ctx.bumps.invited_member_account;

        // Increment member count
        group.member_count += 1;
        group.updated_at = Clock::get()?.unix_timestamp;

        msg!(
            "User {} invited to group by {} (member count: {})",
            ctx.accounts.invited_user.key(),
            ctx.accounts.inviter.key(),
            group.member_count
        );

        Ok(())
    }

    /// Kick/remove a member from the group (moderator+ only)
    pub fn kick_member(ctx: Context<KickMember>, _group_id: [u8; 32]) -> Result<()> {
        let group = &mut ctx.accounts.group_account;
        let kicker_member = &ctx.accounts.kicker_member_account;
        let kicked_member = &ctx.accounts.kicked_member_account;

        // Permission check
        let can_kick = kicker_member.role == GroupRole::Owner
            || kicker_member.role == GroupRole::Admin
            || kicker_member.role == GroupRole::Moderator;

        require!(can_kick, GroupError::InsufficientPermissions);

        // Cannot kick owner
        require!(
            kicked_member.role != GroupRole::Owner,
            GroupError::CannotKickOwner
        );

        // Cannot kick someone with equal or higher role (except owner can kick anyone)
        if kicker_member.role != GroupRole::Owner {
            let kicker_rank = role_to_rank(kicker_member.role);
            let kicked_rank = role_to_rank(kicked_member.role);
            require!(
                kicker_rank > kicked_rank,
                GroupError::InsufficientPermissions
            );
        }

        // Decrement member count
        group.member_count = group.member_count.saturating_sub(1);
        group.updated_at = Clock::get()?.unix_timestamp;

        msg!(
            "Member {} kicked from group by {} (member count: {})",
            ctx.accounts.kicked_user.key(),
            ctx.accounts.kicker.key(),
            group.member_count
        );

        // Account will be closed automatically by Anchor's close constraint
        Ok(())
    }

    /// Update a member's role (admin/owner only)
    pub fn update_member_role(
        ctx: Context<UpdateMemberRole>,
        _group_id: [u8; 32],
        new_role: GroupRole,
    ) -> Result<()> {
        let _group = &ctx.accounts.group_account;
        let updater_member = &ctx.accounts.updater_member_account;
        let target_member = &mut ctx.accounts.target_member_account;

        // Only owner and admin can update roles
        require!(
            updater_member.role == GroupRole::Owner || updater_member.role == GroupRole::Admin,
            GroupError::InsufficientPermissions
        );

        // Cannot change owner role
        require!(
            target_member.role != GroupRole::Owner,
            GroupError::CannotChangeOwnerRole
        );

        // Only owner can promote to Admin
        if new_role == GroupRole::Admin {
            require!(
                updater_member.role == GroupRole::Owner,
                GroupError::InsufficientPermissions
            );
        }

        // Update role and permissions
        let old_role = target_member.role;
        target_member.role = new_role;
        target_member.permissions = match new_role {
            GroupRole::Owner => 0xFFFF, // All permissions
            GroupRole::Admin => {
                PERM_SEND_MESSAGES | PERM_INVITE_MEMBERS | PERM_KICK_MEMBERS | PERM_MANAGE_ROLES
            }
            GroupRole::Moderator => PERM_SEND_MESSAGES | PERM_INVITE_MEMBERS | PERM_KICK_MEMBERS,
            GroupRole::Member => PERM_SEND_MESSAGES,
        };

        msg!(
            "Member {} role updated from {:?} to {:?} by {}",
            ctx.accounts.target_user.key(),
            old_role,
            new_role,
            ctx.accounts.updater.key()
        );

        Ok(())
    }

    /// Create a temporary invite link for a group
    pub fn create_invite_link(
        ctx: Context<CreateInviteLink>,
        group_id: [u8; 32],
        invite_code: String,
        expires_at: i64,
        max_uses: u16,
    ) -> Result<()> {
        let creator_member = &ctx.accounts.creator_member_account;
        let invite_link = &mut ctx.accounts.invite_link_account;

        // Permission check
        let can_create_invite = creator_member.role == GroupRole::Owner
            || creator_member.role == GroupRole::Admin
            || creator_member.role == GroupRole::Moderator
            || (ctx.accounts.group_account.allow_member_invites
                && creator_member.permissions & PERM_INVITE_MEMBERS != 0);

        require!(can_create_invite, GroupError::InsufficientPermissions);

        // Validate invite code
        require!(
            invite_code.len() >= 8 && invite_code.len() <= 16,
            GroupError::InvalidInviteCodeLength
        );
        require!(
            invite_code.chars().all(|c| c.is_ascii_alphanumeric()),
            GroupError::InvalidInviteCodeCharacters
        );

        // Initialize invite link
        invite_link.group_id = group_id;
        invite_link.invite_code = invite_code.clone();
        invite_link.created_by = ctx.accounts.creator.key();
        invite_link.expires_at = expires_at;
        invite_link.max_uses = max_uses;
        invite_link.use_count = 0;
        invite_link.created_at = Clock::get()?.unix_timestamp;
        invite_link.is_active = true;
        invite_link.bump = ctx.bumps.invite_link_account;

        msg!(
            "Invite link '{}' created for group by {}",
            invite_code,
            ctx.accounts.creator.key()
        );

        Ok(())
    }

    /// Revoke/deactivate an invite link
    pub fn revoke_invite_link(
        ctx: Context<RevokeInviteLink>,
        _group_id: [u8; 32],
        _invite_code: String,
    ) -> Result<()> {
        let revoker_member = &ctx.accounts.revoker_member_account;
        let invite_link = &mut ctx.accounts.invite_link_account;

        // Permission check - must be creator, moderator+, or owner
        let can_revoke = invite_link.created_by == ctx.accounts.revoker.key()
            || revoker_member.role == GroupRole::Owner
            || revoker_member.role == GroupRole::Admin
            || revoker_member.role == GroupRole::Moderator;

        require!(can_revoke, GroupError::InsufficientPermissions);

        invite_link.is_active = false;

        msg!(
            "Invite link '{}' revoked by {}",
            invite_link.invite_code,
            ctx.accounts.revoker.key()
        );

        Ok(())
    }

    /// Lookup a group by its public code
    pub fn lookup_group_by_code(_ctx: Context<LookupGroupByCode>) -> Result<()> {
        // The account data is returned automatically by Anchor
        // This instruction is mainly for on-chain verification
        Ok(())
    }
}

// ============================================================================
// Helper Functions
// ============================================================================

fn role_to_rank(role: GroupRole) -> u8 {
    match role {
        GroupRole::Member => 0,
        GroupRole::Moderator => 1,
        GroupRole::Admin => 2,
        GroupRole::Owner => 3,
    }
}

// ============================================================================
// Account Validation Contexts
// ============================================================================

#[derive(Accounts)]
#[instruction(username: String)]
pub struct RegisterUsername<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + UserAccount::INIT_SPACE,
        seeds = [b"username", username.to_lowercase().as_bytes()],
        bump
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(username: String)]
pub struct LookupUsername<'info> {
    #[account(
        seeds = [b"username", username.to_lowercase().as_bytes()],
        bump = user_account.bump
    )]
    pub user_account: Account<'info, UserAccount>,
}

#[derive(Accounts)]
pub struct TransferUsername<'info> {
    #[account(mut)]
    pub user_account: Account<'info, UserAccount>,

    #[account(mut)]
    pub current_owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(username: String)]
pub struct CloseAccount<'info> {
    #[account(
        mut,
        seeds = [b"username", username.to_lowercase().as_bytes()],
        bump = user_account.bump,
        close = owner  // Returns rent to owner
    )]
    pub user_account: Account<'info, UserAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct UpdateEncryptionKey<'info> {
    #[account(mut)]
    pub user_account: Account<'info, UserAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,
}

// ============================================================================
// Group Chat Contexts
// ============================================================================

#[derive(Accounts)]
#[instruction(group_id: [u8; 32])]
pub struct CreateGroup<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + GroupAccount::INIT_SPACE,
        seeds = [b"group", group_id.as_ref()],
        bump
    )]
    pub group_account: Account<'info, GroupAccount>,

    #[account(
        init,
        payer = owner,
        space = 8 + GroupMemberAccount::INIT_SPACE,
        seeds = [b"group:member", group_id.as_ref(), owner.key().as_ref()],
        bump
    )]
    pub owner_member_account: Account<'info, GroupMemberAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(group_id: [u8; 32], public_code: String)]
pub struct SetGroupCode<'info> {
    #[account(
        mut,
        seeds = [b"group", group_id.as_ref()],
        bump = group_account.bump,
        constraint = group_account.owner == owner.key() @ GroupError::NotGroupOwner
    )]
    pub group_account: Account<'info, GroupAccount>,

    #[account(
        init,
        payer = owner,
        space = 8 + GroupCodeLookupAccount::INIT_SPACE,
        seeds = [b"group:code", public_code.to_lowercase().as_bytes()],
        bump
    )]
    pub group_code_lookup: Account<'info, GroupCodeLookupAccount>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(group_id: [u8; 32])]
pub struct JoinGroup<'info> {
    #[account(
        mut,
        seeds = [b"group", group_id.as_ref()],
        bump = group_account.bump
    )]
    pub group_account: Account<'info, GroupAccount>,

    #[account(
        init,
        payer = new_member,
        space = 8 + GroupMemberAccount::INIT_SPACE,
        seeds = [b"group:member", group_id.as_ref(), new_member.key().as_ref()],
        bump
    )]
    pub member_account: Account<'info, GroupMemberAccount>,

    #[account(mut)]
    pub new_member: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(group_id: [u8; 32])]
pub struct LeaveGroup<'info> {
    #[account(
        mut,
        seeds = [b"group", group_id.as_ref()],
        bump = group_account.bump
    )]
    pub group_account: Account<'info, GroupAccount>,

    #[account(
        mut,
        seeds = [b"group:member", group_id.as_ref(), member.key().as_ref()],
        bump = member_account.bump,
        close = member
    )]
    pub member_account: Account<'info, GroupMemberAccount>,

    #[account(mut)]
    pub member: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(group_id: [u8; 32])]
pub struct InviteMember<'info> {
    #[account(
        mut,
        seeds = [b"group", group_id.as_ref()],
        bump = group_account.bump
    )]
    pub group_account: Account<'info, GroupAccount>,

    #[account(
        seeds = [b"group:member", group_id.as_ref(), inviter.key().as_ref()],
        bump = inviter_member_account.bump
    )]
    pub inviter_member_account: Account<'info, GroupMemberAccount>,

    #[account(
        init,
        payer = inviter,
        space = 8 + GroupMemberAccount::INIT_SPACE,
        seeds = [b"group:member", group_id.as_ref(), invited_user.key().as_ref()],
        bump
    )]
    pub invited_member_account: Account<'info, GroupMemberAccount>,

    /// CHECK: The invited user's public key (validated via PDA seeds)
    pub invited_user: AccountInfo<'info>,

    #[account(mut)]
    pub inviter: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(group_id: [u8; 32])]
pub struct KickMember<'info> {
    #[account(
        mut,
        seeds = [b"group", group_id.as_ref()],
        bump = group_account.bump
    )]
    pub group_account: Account<'info, GroupAccount>,

    #[account(
        seeds = [b"group:member", group_id.as_ref(), kicker.key().as_ref()],
        bump = kicker_member_account.bump
    )]
    pub kicker_member_account: Account<'info, GroupMemberAccount>,

    #[account(
        mut,
        seeds = [b"group:member", group_id.as_ref(), kicked_user.key().as_ref()],
        bump = kicked_member_account.bump,
        close = kicker
    )]
    pub kicked_member_account: Account<'info, GroupMemberAccount>,

    /// CHECK: The kicked user's public key (validated via PDA seeds)
    pub kicked_user: AccountInfo<'info>,

    #[account(mut)]
    pub kicker: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(group_id: [u8; 32])]
pub struct UpdateMemberRole<'info> {
    #[account(
        seeds = [b"group", group_id.as_ref()],
        bump = group_account.bump
    )]
    pub group_account: Account<'info, GroupAccount>,

    #[account(
        seeds = [b"group:member", group_id.as_ref(), updater.key().as_ref()],
        bump = updater_member_account.bump
    )]
    pub updater_member_account: Account<'info, GroupMemberAccount>,

    #[account(
        mut,
        seeds = [b"group:member", group_id.as_ref(), target_user.key().as_ref()],
        bump = target_member_account.bump
    )]
    pub target_member_account: Account<'info, GroupMemberAccount>,

    /// CHECK: The target user's public key (validated via PDA seeds)
    pub target_user: AccountInfo<'info>,

    pub updater: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(group_id: [u8; 32], invite_code: String)]
pub struct CreateInviteLink<'info> {
    #[account(
        seeds = [b"group", group_id.as_ref()],
        bump = group_account.bump
    )]
    pub group_account: Account<'info, GroupAccount>,

    #[account(
        seeds = [b"group:member", group_id.as_ref(), creator.key().as_ref()],
        bump = creator_member_account.bump
    )]
    pub creator_member_account: Account<'info, GroupMemberAccount>,

    #[account(
        init,
        payer = creator,
        space = 8 + InviteLinkAccount::INIT_SPACE,
        seeds = [b"group:invite", group_id.as_ref(), invite_code.as_bytes()],
        bump
    )]
    pub invite_link_account: Account<'info, InviteLinkAccount>,

    #[account(mut)]
    pub creator: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(group_id: [u8; 32], invite_code: String)]
pub struct RevokeInviteLink<'info> {
    #[account(
        seeds = [b"group", group_id.as_ref()],
        bump = group_account.bump
    )]
    pub group_account: Account<'info, GroupAccount>,

    #[account(
        seeds = [b"group:member", group_id.as_ref(), revoker.key().as_ref()],
        bump = revoker_member_account.bump
    )]
    pub revoker_member_account: Account<'info, GroupMemberAccount>,

    #[account(
        mut,
        seeds = [b"group:invite", group_id.as_ref(), invite_code.as_bytes()],
        bump = invite_link_account.bump
    )]
    pub invite_link_account: Account<'info, InviteLinkAccount>,

    pub revoker: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(public_code: String)]
pub struct LookupGroupByCode<'info> {
    #[account(
        seeds = [b"group:code", public_code.to_lowercase().as_bytes()],
        bump = group_code_lookup.bump
    )]
    pub group_code_lookup: Account<'info, GroupCodeLookupAccount>,

    #[account(
        seeds = [b"group", group_code_lookup.group_id.as_ref()],
        bump = group_account.bump
    )]
    pub group_account: Account<'info, GroupAccount>,
}

// ============================================================================
// Account Structs
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct UserAccount {
    /// Owner's public key
    pub owner: Pubkey,

    /// The username (lowercase, 3-20 chars)
    #[max_len(20)]
    pub username: String,

    /// Unix timestamp of registration
    pub created_at: i64,

    /// PDA bump seed
    pub bump: u8,

    // NEW: X25519 encryption public key (32 bytes)
    pub encryption_key: [u8; 32],
}

// ============================================================================
// Group Chat Accounts
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct GroupAccount {
    /// Group owner/creator
    pub owner: Pubkey,

    /// Unique group identifier (32-byte hash)
    pub group_id: [u8; 32],

    /// Public code for joining (e.g., "keyapp-general")
    /// Empty string if no public code assigned
    #[max_len(20)]
    pub public_code: String,

    /// Group name (encrypted if private, plaintext if public)
    #[max_len(100)]
    pub name: String,

    /// Group description (encrypted if private, plaintext if public)
    #[max_len(500)]
    pub description: String,

    /// Group avatar Arweave transaction ID
    #[max_len(43)]
    pub avatar_arweave_id: String,

    /// Privacy settings
    pub is_public: bool,
    pub is_searchable: bool,
    pub invite_only: bool,

    /// Group settings
    pub max_members: u16,
    pub allow_member_invites: bool,
    pub require_approval: bool,

    /// Feature flags
    pub enable_replies: bool,
    pub enable_reactions: bool,
    pub enable_read_receipts: bool,
    pub enable_typing_indicators: bool,

    /// Encryption key for private groups (32 bytes, shared among members)
    /// For public groups, this is zero/unused
    pub group_encryption_key: [u8; 32],

    /// Member count (for quick lookup)
    pub member_count: u16,

    /// Timestamps
    pub created_at: i64,
    pub updated_at: i64,

    /// PDA bump
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct GroupMemberAccount {
    /// The group this membership belongs to
    pub group_id: [u8; 32],

    /// Member's public key
    pub member: Pubkey,

    /// Role in the group
    pub role: GroupRole,

    /// Permissions (bitflags)
    pub permissions: u16,

    /// Custom encryption key for this member (for key rotation)
    /// Encrypted with member's X25519 public key
    pub encrypted_group_key: [u8; 64],

    /// Join timestamp
    pub joined_at: i64,

    /// Last read message timestamp (for read receipts)
    pub last_read_at: i64,

    /// Status flags
    pub is_active: bool,
    pub is_muted: bool,
    pub is_banned: bool,

    /// Invited by (for audit trail)
    pub invited_by: Pubkey,

    /// PDA bump
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct InviteLinkAccount {
    /// The group this invite is for
    pub group_id: [u8; 32],

    /// Unique invite code (8-16 chars)
    #[max_len(16)]
    pub invite_code: String,

    /// Creator of the invite link
    pub created_by: Pubkey,

    /// Expiration timestamp (0 = never expires)
    pub expires_at: i64,

    /// Maximum uses (0 = unlimited)
    pub max_uses: u16,

    /// Current use count
    pub use_count: u16,

    /// Creation timestamp
    pub created_at: i64,

    /// Is active (can be revoked)
    pub is_active: bool,

    /// PDA bump
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct GroupCodeLookupAccount {
    /// Public code (e.g., "keyapp")
    #[max_len(20)]
    pub public_code: String,

    /// The actual group_id this code points to
    pub group_id: [u8; 32],

    /// PDA bump
    pub bump: u8,
}

// ============================================================================
// Enums
// ============================================================================

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace, Debug)]
pub enum GroupRole {
    Member,    // Basic member (default)
    Moderator, // Can kick members, manage settings
    Admin,     // Can promote/demote, manage admins
    Owner,     // Full control (only one)
}

// ============================================================================
// Permission Constants
// ============================================================================

pub const PERM_SEND_MESSAGES: u16 = 1 << 0;
pub const PERM_INVITE_MEMBERS: u16 = 1 << 1;
pub const PERM_KICK_MEMBERS: u16 = 1 << 2;
pub const PERM_MANAGE_SETTINGS: u16 = 1 << 3;
pub const PERM_DELETE_MESSAGES: u16 = 1 << 4;
pub const PERM_PIN_MESSAGES: u16 = 1 << 5;
pub const PERM_MANAGE_ROLES: u16 = 1 << 6;

#[error_code]
pub enum KeyError {
    #[msg("Username must be 3-20 characters")]
    InvalidUsernameLength,

    #[msg("Username can only contain letters, numbers, and underscores")]
    InvalidUsernameCharacters,

    #[msg("Username already taken")]
    UsernameTaken,

    #[msg("Only the owner can perform this action")]
    NotOwner,
}

#[error_code]
pub enum GroupError {
    #[msg("Group name must be 1-100 characters")]
    InvalidGroupNameLength,

    #[msg("Group description must be 0-500 characters")]
    InvalidGroupDescriptionLength,

    #[msg("Public code must be 3-20 characters")]
    InvalidPublicCodeLength,

    #[msg("Public code can only contain lowercase letters, numbers, and hyphens")]
    InvalidPublicCodeCharacters,

    #[msg("Group is full (max members reached)")]
    GroupFull,

    #[msg("Only the group owner can perform this action")]
    NotGroupOwner,

    #[msg("Insufficient permissions")]
    InsufficientPermissions,

    #[msg("Member is banned from this group")]
    MemberBanned,

    #[msg("Invite link expired or invalid")]
    InvalidInviteLink,

    #[msg("Invite link usage limit reached")]
    InviteLinkExhausted,

    #[msg("Owner cannot leave the group")]
    OwnerCannotLeave,

    #[msg("Cannot kick the group owner")]
    CannotKickOwner,

    #[msg("Cannot change the owner's role")]
    CannotChangeOwnerRole,

    #[msg("Invite code must be 8-16 characters")]
    InvalidInviteCodeLength,

    #[msg("Invite code can only contain alphanumeric characters")]
    InvalidInviteCodeCharacters,

    #[msg("Public code already taken")]
    PublicCodeTaken,

    #[msg("Cannot kick yourself")]
    CannotKickSelf,

    #[msg("Cannot leave group as the only owner")]
    CannotLeaveAsOwner,

    #[msg("Group requires approval to join")]
    RequiresApproval,

    #[msg("Member already in group")]
    MemberAlreadyExists,

    #[msg("Member not found in group")]
    MemberNotFound,

    #[msg("Invalid group ID")]
    InvalidGroupId,
}
