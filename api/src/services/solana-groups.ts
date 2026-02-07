import {
    Connection,
    PublicKey,
    Transaction,
    TransactionInstruction,
    SystemProgram,
} from '@solana/web3.js';
import crypto from 'crypto';
import bs58 from 'bs58';
import { connection, getFeePayer } from './solana.js';

// Program ID from deployed Anchor program
const PROGRAM_ID = new PublicKey('96hG67JxhNEptr1LkdtDcrqvtWiHH3x4GibDBcdh4MYQ');

// ============================================================================
// Discriminator Calculation
// ============================================================================

/**
 * Calculate Anchor instruction discriminator
 * Format: first 8 bytes of sha256('global:<instruction_name>')
 */
function getDiscriminator(instructionName: string): Buffer {
    const hash = crypto.createHash('sha256')
        .update(`global:${instructionName}`)
        .digest();
    return hash.slice(0, 8);
}

// Pre-computed discriminators for performance
const DISCRIMINATORS = {
    CREATE_GROUP: getDiscriminator('create_group'),
    SET_GROUP_CODE: getDiscriminator('set_group_code'),
    JOIN_GROUP: getDiscriminator('join_group'),
    LEAVE_GROUP: getDiscriminator('leave_group'),
    INVITE_MEMBER: getDiscriminator('invite_member'),
    KICK_MEMBER: getDiscriminator('kick_member'),
    UPDATE_MEMBER_ROLE: getDiscriminator('update_member_role'),
    CREATE_INVITE_LINK: getDiscriminator('create_invite_link'),
    REVOKE_INVITE_LINK: getDiscriminator('revoke_invite_link'),
    LOOKUP_GROUP_BY_CODE: getDiscriminator('lookup_group_by_code'),
};

// ============================================================================
// PDA Derivation Functions
// ============================================================================

/**
 * Get PDA for a group account
 * Seeds: [b"group", group_id]
 */
export function getGroupPDA(groupId: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('group'), groupId],
        PROGRAM_ID
    );
}

/**
 * Get PDA for a group member account
 * Seeds: [b"group:member", group_id, member_pubkey]
 */
export function getGroupMemberPDA(groupId: Buffer, memberPubkey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('group:member'), groupId, memberPubkey.toBuffer()],
        PROGRAM_ID
    );
}

/**
 * Get PDA for a group code lookup account
 * Seeds: [b"group:code", public_code.to_lowercase()]
 */
export function getGroupCodeLookupPDA(publicCode: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('group:code'), Buffer.from(publicCode.toLowerCase())],
        PROGRAM_ID
    );
}

/**
 * Get PDA for an invite link account
 * Seeds: [b"group:invite", group_id, invite_code]
 */
export function getInviteLinkPDA(groupId: Buffer, inviteCode: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [Buffer.from('group:invite'), groupId, Buffer.from(inviteCode)],
        PROGRAM_ID
    );
}

// ============================================================================
// Borsh Serialization Helpers
// ============================================================================

/**
 * Serialize a string for Borsh: 4-byte length prefix + UTF-8 bytes
 */
function serializeString(str: string): Buffer {
    const strBytes = Buffer.from(str, 'utf-8');
    const lengthBuf = Buffer.alloc(4);
    lengthBuf.writeUInt32LE(strBytes.length, 0);
    return Buffer.concat([lengthBuf, strBytes]);
}

/**
 * Serialize a boolean for Borsh: 1 byte (0 or 1)
 */
function serializeBool(value: boolean): Buffer {
    const buf = Buffer.alloc(1);
    buf.writeUInt8(value ? 1 : 0, 0);
    return buf;
}

/**
 * Serialize a u16 for Borsh: 2 bytes little-endian
 */
function serializeU16(value: number): Buffer {
    const buf = Buffer.alloc(2);
    buf.writeUInt16LE(value, 0);
    return buf;
}

/**
 * Serialize an i64 for Borsh: 8 bytes little-endian
 */
function serializeI64(value: number): Buffer {
    const buf = Buffer.alloc(8);
    buf.writeBigInt64LE(BigInt(value), 0);
    return buf;
}

/**
 * Serialize GroupRole enum for Borsh: 1 byte
 * Member = 0, Moderator = 1, Admin = 2, Owner = 3
 */
function serializeGroupRole(role: 'Member' | 'Moderator' | 'Admin' | 'Owner'): Buffer {
    const roleMap = { Member: 0, Moderator: 1, Admin: 2, Owner: 3 };
    const buf = Buffer.alloc(1);
    buf.writeUInt8(roleMap[role], 0);
    return buf;
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface CreateGroupParams {
    groupId: Buffer; // 32 bytes
    name: string;
    description: string;
    isPublic: boolean;
    isSearchable: boolean;
    inviteOnly: boolean;
    maxMembers: number; // u16
    allowMemberInvites: boolean;
    groupEncryptionKey: Buffer; // 32 bytes
    ownerPubkey: PublicKey;
}

export interface SetGroupCodeParams {
    groupId: Buffer;
    publicCode: string;
    ownerPubkey: PublicKey;
}

export interface JoinGroupParams {
    groupId: Buffer;
    encryptedGroupKey: Buffer; // 64 bytes
    memberPubkey: PublicKey;
}

export interface LeaveGroupParams {
    groupId: Buffer;
    memberPubkey: PublicKey;
}

export interface InviteMemberParams {
    groupId: Buffer;
    invitedUserPubkey: PublicKey;
    encryptedGroupKey: Buffer; // 64 bytes
    inviterPubkey: PublicKey;
}

export interface KickMemberParams {
    groupId: Buffer;
    kickedUserPubkey: PublicKey;
    kickerPubkey: PublicKey;
}

export interface UpdateMemberRoleParams {
    groupId: Buffer;
    targetUserPubkey: PublicKey;
    newRole: 'Member' | 'Moderator' | 'Admin' | 'Owner';
    updaterPubkey: PublicKey;
}

export interface CreateInviteLinkParams {
    groupId: Buffer;
    inviteCode: string;
    expiresAt: number; // Unix timestamp (i64)
    maxUses: number; // u16
    creatorPubkey: PublicKey;
}

export interface RevokeInviteLinkParams {
    groupId: Buffer;
    inviteCode: string;
    revokerPubkey: PublicKey;
}

// ============================================================================
// Instruction Data Builders
// ============================================================================

/**
 * Build instruction data for create_group
 */
function buildCreateGroupData(params: CreateGroupParams): Buffer {
    return Buffer.concat([
        DISCRIMINATORS.CREATE_GROUP,
        params.groupId, // 32 bytes (fixed)
        serializeString(params.name),
        serializeString(params.description),
        serializeBool(params.isPublic),
        serializeBool(params.isSearchable),
        serializeBool(params.inviteOnly),
        serializeU16(params.maxMembers),
        serializeBool(params.allowMemberInvites),
        params.groupEncryptionKey, // 32 bytes (fixed)
    ]);
}

/**
 * Build instruction data for set_group_code
 */
function buildSetGroupCodeData(params: SetGroupCodeParams): Buffer {
    return Buffer.concat([
        DISCRIMINATORS.SET_GROUP_CODE,
        params.groupId, // 32 bytes
        serializeString(params.publicCode),
    ]);
}

/**
 * Build instruction data for join_group
 */
function buildJoinGroupData(params: JoinGroupParams): Buffer {
    return Buffer.concat([
        DISCRIMINATORS.JOIN_GROUP,
        params.groupId, // 32 bytes
        params.encryptedGroupKey, // 64 bytes (fixed)
    ]);
}

/**
 * Build instruction data for leave_group
 */
function buildLeaveGroupData(params: LeaveGroupParams): Buffer {
    return Buffer.concat([
        DISCRIMINATORS.LEAVE_GROUP,
        params.groupId, // 32 bytes
    ]);
}

/**
 * Build instruction data for invite_member
 */
function buildInviteMemberData(params: InviteMemberParams): Buffer {
    return Buffer.concat([
        DISCRIMINATORS.INVITE_MEMBER,
        params.groupId, // 32 bytes
        params.encryptedGroupKey, // 64 bytes
    ]);
}

/**
 * Build instruction data for kick_member
 */
function buildKickMemberData(params: KickMemberParams): Buffer {
    return Buffer.concat([
        DISCRIMINATORS.KICK_MEMBER,
        params.groupId, // 32 bytes
    ]);
}

/**
 * Build instruction data for update_member_role
 */
function buildUpdateMemberRoleData(params: UpdateMemberRoleParams): Buffer {
    return Buffer.concat([
        DISCRIMINATORS.UPDATE_MEMBER_ROLE,
        params.groupId, // 32 bytes
        serializeGroupRole(params.newRole),
    ]);
}

/**
 * Build instruction data for create_invite_link
 */
function buildCreateInviteLinkData(params: CreateInviteLinkParams): Buffer {
    return Buffer.concat([
        DISCRIMINATORS.CREATE_INVITE_LINK,
        params.groupId, // 32 bytes
        serializeString(params.inviteCode),
        serializeI64(params.expiresAt),
        serializeU16(params.maxUses),
    ]);
}

/**
 * Build instruction data for revoke_invite_link
 */
function buildRevokeInviteLinkData(params: RevokeInviteLinkParams): Buffer {
    return Buffer.concat([
        DISCRIMINATORS.REVOKE_INVITE_LINK,
        params.groupId, // 32 bytes
        serializeString(params.inviteCode),
    ]);
}

// ============================================================================
// Transaction Builders
// ============================================================================

/**
 * Build an unsigned transaction to create a group
 * Returns transaction ready for user to sign
 */
export async function buildCreateGroupTransaction(
    params: CreateGroupParams
): Promise<{
    transaction: Transaction;
    blockhash: string;
    lastValidBlockHeight: number;
}> {
    const feePayer = getFeePayer();
    const [groupPDA] = getGroupPDA(params.groupId);
    const [ownerMemberPDA] = getGroupMemberPDA(params.groupId, params.ownerPubkey);

    // Calculate rent for both accounts
    const groupSpace = 8 + 400; // Discriminator + GroupAccount (~400 bytes)
    const memberSpace = 8 + 200; // Discriminator + GroupMemberAccount (~200 bytes)
    const groupRent = await connection.getMinimumBalanceForRentExemption(groupSpace);
    const memberRent = await connection.getMinimumBalanceForRentExemption(memberSpace);
    const totalRent = groupRent + memberRent;

    // Fund owner account to cover PDA creation
    const ownerRentExempt = await connection.getMinimumBalanceForRentExemption(0);
    const totalFunding = totalRent + ownerRentExempt + 100_000; // Buffer for fees

    // Instruction 1: Fund owner account
    const fundOwnerIx = SystemProgram.transfer({
        fromPubkey: feePayer.publicKey,
        toPubkey: params.ownerPubkey,
        lamports: totalFunding,
    });

    // Instruction 2: Create group
    const instructionData = buildCreateGroupData(params);
    const createGroupIx = new TransactionInstruction({
        keys: [
            { pubkey: groupPDA, isSigner: false, isWritable: true },
            { pubkey: ownerMemberPDA, isSigner: false, isWritable: true },
            { pubkey: params.ownerPubkey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    // Build transaction
    const transaction = new Transaction().add(fundOwnerIx, createGroupIx);
    transaction.feePayer = feePayer.publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return { transaction, blockhash, lastValidBlockHeight };
}

/**
 * Build an unsigned transaction to set a public code for a group
 */
export async function buildSetGroupCodeTransaction(
    params: SetGroupCodeParams
): Promise<{
    transaction: Transaction;
    blockhash: string;
    lastValidBlockHeight: number;
}> {
    const feePayer = getFeePayer();
    const [groupPDA] = getGroupPDA(params.groupId);
    const [lookupPDA] = getGroupCodeLookupPDA(params.publicCode);

    // Calculate rent for lookup account
    const lookupSpace = 8 + 60; // Discriminator + GroupCodeLookupAccount (~60 bytes)
    const lookupRent = await connection.getMinimumBalanceForRentExemption(lookupSpace);

    // Fund owner for lookup account creation
    const fundOwnerIx = SystemProgram.transfer({
        fromPubkey: feePayer.publicKey,
        toPubkey: params.ownerPubkey,
        lamports: lookupRent + 50_000, // Buffer
    });

    // Create set code instruction
    const instructionData = buildSetGroupCodeData(params);
    const setCodeIx = new TransactionInstruction({
        keys: [
            { pubkey: groupPDA, isSigner: false, isWritable: true },
            { pubkey: lookupPDA, isSigner: false, isWritable: true },
            { pubkey: params.ownerPubkey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    const transaction = new Transaction().add(fundOwnerIx, setCodeIx);
    transaction.feePayer = feePayer.publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return { transaction, blockhash, lastValidBlockHeight };
}

/**
 * Build an unsigned transaction to join a group
 */
export async function buildJoinGroupTransaction(
    params: JoinGroupParams
): Promise<{
    transaction: Transaction;
    blockhash: string;
    lastValidBlockHeight: number;
}> {
    const feePayer = getFeePayer();
    const [groupPDA] = getGroupPDA(params.groupId);
    const [memberPDA] = getGroupMemberPDA(params.groupId, params.memberPubkey);

    // Calculate rent for member account
    const memberSpace = 8 + 200;
    const memberRent = await connection.getMinimumBalanceForRentExemption(memberSpace);

    // Fund member for account creation
    const fundMemberIx = SystemProgram.transfer({
        fromPubkey: feePayer.publicKey,
        toPubkey: params.memberPubkey,
        lamports: memberRent + 50_000,
    });

    // Create join instruction
    const instructionData = buildJoinGroupData(params);
    const joinIx = new TransactionInstruction({
        keys: [
            { pubkey: groupPDA, isSigner: false, isWritable: true },
            { pubkey: memberPDA, isSigner: false, isWritable: true },
            { pubkey: params.memberPubkey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    const transaction = new Transaction().add(fundMemberIx, joinIx);
    transaction.feePayer = feePayer.publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return { transaction, blockhash, lastValidBlockHeight };
}

/**
 * Build an unsigned transaction to leave a group
 */
export async function buildLeaveGroupTransaction(
    params: LeaveGroupParams
): Promise<{
    transaction: Transaction;
    blockhash: string;
    lastValidBlockHeight: number;
}> {
    const feePayer = getFeePayer();
    const [groupPDA] = getGroupPDA(params.groupId);
    const [memberPDA] = getGroupMemberPDA(params.groupId, params.memberPubkey);

    const instructionData = buildLeaveGroupData(params);
    const leaveIx = new TransactionInstruction({
        keys: [
            { pubkey: groupPDA, isSigner: false, isWritable: true },
            { pubkey: memberPDA, isSigner: false, isWritable: true },
            { pubkey: params.memberPubkey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    const transaction = new Transaction().add(leaveIx);
    transaction.feePayer = feePayer.publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return { transaction, blockhash, lastValidBlockHeight };
}

/**
 * Build an unsigned transaction to invite a member to a group
 */
export async function buildInviteMemberTransaction(
    params: InviteMemberParams
): Promise<{
    transaction: Transaction;
    blockhash: string;
    lastValidBlockHeight: number;
}> {
    const feePayer = getFeePayer();
    const [groupPDA] = getGroupPDA(params.groupId);
    const [inviterMemberPDA] = getGroupMemberPDA(params.groupId, params.inviterPubkey);
    const [invitedMemberPDA] = getGroupMemberPDA(params.groupId, params.invitedUserPubkey);

    // Calculate rent for invited member account
    const memberSpace = 8 + 200;
    const memberRent = await connection.getMinimumBalanceForRentExemption(memberSpace);

    // Fund inviter for creating invited member account
    const fundInviterIx = SystemProgram.transfer({
        fromPubkey: feePayer.publicKey,
        toPubkey: params.inviterPubkey,
        lamports: memberRent + 50_000,
    });

    // Create invite instruction
    const instructionData = buildInviteMemberData(params);
    const inviteIx = new TransactionInstruction({
        keys: [
            { pubkey: groupPDA, isSigner: false, isWritable: true },
            { pubkey: inviterMemberPDA, isSigner: false, isWritable: false },
            { pubkey: invitedMemberPDA, isSigner: false, isWritable: true },
            { pubkey: params.invitedUserPubkey, isSigner: false, isWritable: false },
            { pubkey: params.inviterPubkey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    const transaction = new Transaction().add(fundInviterIx, inviteIx);
    transaction.feePayer = feePayer.publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return { transaction, blockhash, lastValidBlockHeight };
}

/**
 * Build an unsigned transaction to kick a member from a group
 */
export async function buildKickMemberTransaction(
    params: KickMemberParams
): Promise<{
    transaction: Transaction;
    blockhash: string;
    lastValidBlockHeight: number;
}> {
    const feePayer = getFeePayer();
    const [groupPDA] = getGroupPDA(params.groupId);
    const [kickerMemberPDA] = getGroupMemberPDA(params.groupId, params.kickerPubkey);
    const [kickedMemberPDA] = getGroupMemberPDA(params.groupId, params.kickedUserPubkey);

    const instructionData = buildKickMemberData(params);
    const kickIx = new TransactionInstruction({
        keys: [
            { pubkey: groupPDA, isSigner: false, isWritable: true },
            { pubkey: kickerMemberPDA, isSigner: false, isWritable: false },
            { pubkey: kickedMemberPDA, isSigner: false, isWritable: true },
            { pubkey: params.kickedUserPubkey, isSigner: false, isWritable: false },
            { pubkey: params.kickerPubkey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    const transaction = new Transaction().add(kickIx);
    transaction.feePayer = feePayer.publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return { transaction, blockhash, lastValidBlockHeight };
}

/**
 * Build an unsigned transaction to update a member's role
 */
export async function buildUpdateMemberRoleTransaction(
    params: UpdateMemberRoleParams
): Promise<{
    transaction: Transaction;
    blockhash: string;
    lastValidBlockHeight: number;
}> {
    const feePayer = getFeePayer();
    const [groupPDA] = getGroupPDA(params.groupId);
    const [updaterMemberPDA] = getGroupMemberPDA(params.groupId, params.updaterPubkey);
    const [targetMemberPDA] = getGroupMemberPDA(params.groupId, params.targetUserPubkey);

    const instructionData = buildUpdateMemberRoleData(params);
    const updateRoleIx = new TransactionInstruction({
        keys: [
            { pubkey: groupPDA, isSigner: false, isWritable: false },
            { pubkey: updaterMemberPDA, isSigner: false, isWritable: false },
            { pubkey: targetMemberPDA, isSigner: false, isWritable: true },
            { pubkey: params.targetUserPubkey, isSigner: false, isWritable: false },
            { pubkey: params.updaterPubkey, isSigner: true, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    const transaction = new Transaction().add(updateRoleIx);
    transaction.feePayer = feePayer.publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return { transaction, blockhash, lastValidBlockHeight };
}

/**
 * Build an unsigned transaction to create an invite link
 */
export async function buildCreateInviteLinkTransaction(
    params: CreateInviteLinkParams
): Promise<{
    transaction: Transaction;
    blockhash: string;
    lastValidBlockHeight: number;
}> {
    const feePayer = getFeePayer();
    const [groupPDA] = getGroupPDA(params.groupId);
    const [creatorMemberPDA] = getGroupMemberPDA(params.groupId, params.creatorPubkey);
    const [inviteLinkPDA] = getInviteLinkPDA(params.groupId, params.inviteCode);

    // Calculate rent for invite link account
    const inviteLinkSpace = 8 + 120;
    const inviteLinkRent = await connection.getMinimumBalanceForRentExemption(inviteLinkSpace);

    // Fund creator for invite link account
    const fundCreatorIx = SystemProgram.transfer({
        fromPubkey: feePayer.publicKey,
        toPubkey: params.creatorPubkey,
        lamports: inviteLinkRent + 50_000,
    });

    // Create invite link instruction
    const instructionData = buildCreateInviteLinkData(params);
    const createInviteIx = new TransactionInstruction({
        keys: [
            { pubkey: groupPDA, isSigner: false, isWritable: false },
            { pubkey: creatorMemberPDA, isSigner: false, isWritable: false },
            { pubkey: inviteLinkPDA, isSigner: false, isWritable: true },
            { pubkey: params.creatorPubkey, isSigner: true, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    const transaction = new Transaction().add(fundCreatorIx, createInviteIx);
    transaction.feePayer = feePayer.publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return { transaction, blockhash, lastValidBlockHeight };
}

/**
 * Build an unsigned transaction to revoke an invite link
 */
export async function buildRevokeInviteLinkTransaction(
    params: RevokeInviteLinkParams
): Promise<{
    transaction: Transaction;
    blockhash: string;
    lastValidBlockHeight: number;
}> {
    const feePayer = getFeePayer();
    const [groupPDA] = getGroupPDA(params.groupId);
    const [revokerMemberPDA] = getGroupMemberPDA(params.groupId, params.revokerPubkey);
    const [inviteLinkPDA] = getInviteLinkPDA(params.groupId, params.inviteCode);

    const instructionData = buildRevokeInviteLinkData(params);
    const revokeIx = new TransactionInstruction({
        keys: [
            { pubkey: groupPDA, isSigner: false, isWritable: false },
            { pubkey: revokerMemberPDA, isSigner: false, isWritable: false },
            { pubkey: inviteLinkPDA, isSigner: false, isWritable: true },
            { pubkey: params.revokerPubkey, isSigner: true, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: instructionData,
    });

    const transaction = new Transaction().add(revokeIx);
    transaction.feePayer = feePayer.publicKey;

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return { transaction, blockhash, lastValidBlockHeight };
}

// ============================================================================
// Account Fetching and Parsing Functions
// ============================================================================

/**
 * Parse GroupAccount from raw account data
 */
export async function getGroupAccount(groupId: Buffer): Promise<{
    owner: string;
    groupId: string;
    publicCode: string;
    name: string;
    description: string;
    avatarArweaveId: string;
    isPublic: boolean;
    isSearchable: boolean;
    inviteOnly: boolean;
    maxMembers: number;
    allowMemberInvites: boolean;
    requireApproval: boolean;
    enableReplies: boolean;
    enableReactions: boolean;
    enableReadReceipts: boolean;
    enableTypingIndicators: boolean;
    groupEncryptionKey: string; // Base64
    memberCount: number;
    createdAt: number;
    updatedAt: number;
} | null> {
    try {
        const [pda] = getGroupPDA(groupId);
        const accountInfo = await connection.getAccountInfo(pda);

        if (!accountInfo) return null;

        const data = accountInfo.data;
        let offset = 8; // Skip discriminator

        // Parse fields in exact Rust struct order
        const owner = new PublicKey(data.slice(offset, offset + 32)).toBase58();
        offset += 32;

        const groupIdBytes = data.slice(offset, offset + 32);
        offset += 32;

        // Parse strings (4-byte length + UTF-8 bytes)
        const publicCodeLen = data.readUInt32LE(offset);
        offset += 4;
        const publicCode = data.slice(offset, offset + publicCodeLen).toString('utf-8');
        offset += publicCodeLen;

        const nameLen = data.readUInt32LE(offset);
        offset += 4;
        const name = data.slice(offset, offset + nameLen).toString('utf-8');
        offset += nameLen;

        const descLen = data.readUInt32LE(offset);
        offset += 4;
        const description = data.slice(offset, offset + descLen).toString('utf-8');
        offset += descLen;

        const avatarLen = data.readUInt32LE(offset);
        offset += 4;
        const avatarArweaveId = data.slice(offset, offset + avatarLen).toString('utf-8');
        offset += avatarLen;

        // Booleans (1 byte each)
        const isPublic = data.readUInt8(offset) === 1;
        offset += 1;
        const isSearchable = data.readUInt8(offset) === 1;
        offset += 1;
        const inviteOnly = data.readUInt8(offset) === 1;
        offset += 1;

        // u16 fields
        const maxMembers = data.readUInt16LE(offset);
        offset += 2;

        // More booleans
        const allowMemberInvites = data.readUInt8(offset) === 1;
        offset += 1;
        const requireApproval = data.readUInt8(offset) === 1;
        offset += 1;
        const enableReplies = data.readUInt8(offset) === 1;
        offset += 1;
        const enableReactions = data.readUInt8(offset) === 1;
        offset += 1;
        const enableReadReceipts = data.readUInt8(offset) === 1;
        offset += 1;
        const enableTypingIndicators = data.readUInt8(offset) === 1;
        offset += 1;

        // Encryption key (32 bytes)
        const groupEncryptionKey = data.slice(offset, offset + 32).toString('base64');
        offset += 32;

        // u16 member count
        const memberCount = data.readUInt16LE(offset);
        offset += 2;

        // i64 timestamps
        const createdAt = Number(data.readBigInt64LE(offset));
        offset += 8;
        const updatedAt = Number(data.readBigInt64LE(offset));
        offset += 8;

        return {
            owner,
            groupId: groupIdBytes.toString('hex'),
            publicCode,
            name,
            description,
            avatarArweaveId,
            isPublic,
            isSearchable,
            inviteOnly,
            maxMembers,
            allowMemberInvites,
            requireApproval,
            enableReplies,
            enableReactions,
            enableReadReceipts,
            enableTypingIndicators,
            groupEncryptionKey,
            memberCount,
            createdAt,
            updatedAt,
        };
    } catch (error) {
        console.error('Error fetching group account:', error);
        return null;
    }
}

/**
 * Parse GroupMemberAccount from raw account data
 */
export async function getGroupMemberAccount(groupId: Buffer, memberPubkey: PublicKey): Promise<{
    groupId: string;
    member: string;
    role: string;
    permissions: number;
    encryptedGroupKey: string; // Base64
    joinedAt: number;
    lastReadAt: number;
    isActive: boolean;
    isMuted: boolean;
    isBanned: boolean;
    invitedBy: string;
} | null> {
    try {
        const [pda] = getGroupMemberPDA(groupId, memberPubkey);
        const accountInfo = await connection.getAccountInfo(pda);

        if (!accountInfo) return null;

        const data = accountInfo.data;
        let offset = 8; // Skip discriminator

        const groupIdBytes = data.slice(offset, offset + 32);
        offset += 32;

        const member = new PublicKey(data.slice(offset, offset + 32)).toBase58();
        offset += 32;

        // Role enum (1 byte)
        const roleValue = data.readUInt8(offset);
        const roleMap = ['Member', 'Moderator', 'Admin', 'Owner'];
        const role = roleMap[roleValue];
        offset += 1;

        const permissions = data.readUInt16LE(offset);
        offset += 2;

        const encryptedGroupKey = data.slice(offset, offset + 64).toString('base64');
        offset += 64;

        const joinedAt = Number(data.readBigInt64LE(offset));
        offset += 8;

        const lastReadAt = Number(data.readBigInt64LE(offset));
        offset += 8;

        const isActive = data.readUInt8(offset) === 1;
        offset += 1;
        const isMuted = data.readUInt8(offset) === 1;
        offset += 1;
        const isBanned = data.readUInt8(offset) === 1;
        offset += 1;

        const invitedBy = new PublicKey(data.slice(offset, offset + 32)).toBase58();
        offset += 32;

        return {
            groupId: groupIdBytes.toString('hex'),
            member,
            role,
            permissions,
            encryptedGroupKey,
            joinedAt,
            lastReadAt,
            isActive,
            isMuted,
            isBanned,
            invitedBy,
        };
    } catch (error) {
        console.error('Error fetching group member account:', error);
        return null;
    }
}

/**
 * Lookup group by public code
 */
export async function lookupGroupByCode(publicCode: string): Promise<string | null> {
    try {
        const [lookupPDA] = getGroupCodeLookupPDA(publicCode);
        const accountInfo = await connection.getAccountInfo(lookupPDA);

        if (!accountInfo) return null;

        const data = accountInfo.data;
        let offset = 8; // Skip discriminator

        // Skip public_code string (already known)
        const codeLen = data.readUInt32LE(offset);
        offset += 4 + codeLen;

        // Read group_id (32 bytes)
        const groupId = data.slice(offset, offset + 32);
        return groupId.toString('hex');
    } catch (error) {
        console.error('Error looking up group by code:', error);
        return null;
    }
}

/**
 * Get all members of a group (via getProgramAccounts)
 */
export async function getAllGroupMembers(groupId: Buffer): Promise<string[]> {
    try {
        const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
            filters: [
                {
                    memcmp: {
                        offset: 8, // Skip discriminator
                        bytes: bs58.encode(groupId),
                    },
                },
            ],
        });

        const members: string[] = [];
        for (const { account } of accounts) {
            try {
                const data = account.data;
                // Check if this is a GroupMemberAccount (offset 8 = group_id)
                // Read member pubkey at offset 8 + 32 = 40
                const memberPubkey = new PublicKey(data.slice(40, 72));
                members.push(memberPubkey.toBase58());
            } catch {
                continue;
            }
        }

        return members;
    } catch (error) {
        console.error('Error fetching group members:', error);
        return [];
    }
}

/**
 * Search public groups (via getProgramAccounts with filters)
 */
export async function searchPublicGroups(query?: string): Promise<Array<{
    groupId: string;
    name: string;
    description: string;
    memberCount: number;
    publicCode: string;
}>> {
    try {
        // Fetch all group accounts (this is a simplified approach)
        // In production, you'd want more sophisticated indexing
        const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
            filters: [
                {
                    dataSize: 8 + 400, // Approximate size of GroupAccount
                },
            ],
        });

        const groups: Array<{
            groupId: string;
            name: string;
            description: string;
            memberCount: number;
            publicCode: string;
        }> = [];

        for (const { account } of accounts) {
            try {
                const data = account.data;
                // Extract group_id from offset 8 + 32 = 40
                const groupId = data.slice(40, 72);
                const parsed = await getGroupAccount(groupId);

                if (parsed && parsed.isPublic && parsed.isSearchable) {
                    if (!query || parsed.name.toLowerCase().includes(query.toLowerCase())) {
                        groups.push({
                            groupId: parsed.groupId,
                            name: parsed.name,
                            description: parsed.description,
                            memberCount: parsed.memberCount,
                            publicCode: parsed.publicCode,
                        });
                    }
                }
            } catch {
                continue;
            }
        }

        return groups;
    } catch (error) {
        console.error('Error searching public groups:', error);
        return [];
    }
}
