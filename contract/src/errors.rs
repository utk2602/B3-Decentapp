use anchor_lang::prelude::*;

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
