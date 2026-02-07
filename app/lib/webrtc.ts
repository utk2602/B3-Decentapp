import {
    RTCPeerConnection,
    RTCIceCandidate,
    RTCSessionDescription,
    mediaDevices,
    MediaStream,
} from 'react-native-webrtc';
import { getStoredKeypair } from './keychain';
import { signMessage, uint8ToBase58, uint8ToBase64 } from './crypto';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api';

// STUN servers for NAT traversal
const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

export interface CallSession {
    peerId: string;
    peerConnection: RTCPeerConnection;
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    state: CallState;
    isVideo: boolean;
}

let currentSession: CallSession | null = null;
let onStateChange: ((state: CallState) => void) | null = null;
let onRemoteStream: ((stream: MediaStream) => void) | null = null;

/**
 * Create a new peer connection
 */
function createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = async (event) => {
        if (event.candidate && currentSession) {
            await sendSignal('ice-candidate', {
                peerId: currentSession.peerId,
                candidate: event.candidate,
            });
        }
    };

    pc.ontrack = (event) => {
        if (event.streams[0] && currentSession) {
            currentSession.remoteStream = event.streams[0];
            onRemoteStream?.(event.streams[0]);
        }
    };

    pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
            updateState('connected');
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            endCall();
        }
    };

    return pc;
}

/**
 * Update call state
 */
function updateState(state: CallState) {
    if (currentSession) {
        currentSession.state = state;
        onStateChange?.(state);
    }
}

/**
 * Send a signaling message via API
 */
async function sendSignal(type: string, data: any): Promise<void> {
    try {
        const keypair = await getStoredKeypair();
        if (!keypair) return;

        const timestamp = Date.now();
        const senderPubkey = uint8ToBase58(keypair.publicKey);
        const messageToSign = `signal:${type}:${timestamp}`;
        const signatureBytes = signMessage(new TextEncoder().encode(messageToSign), keypair.secretKey);
        const signature = uint8ToBase64(signatureBytes);

        await fetch(`${API_URL}/signaling/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type,
                senderPubkey,
                signature,
                timestamp,
                ...data,
            }),
        });
    } catch (error) {
        console.error('Failed to send signal:', error);
    }
}

/**
 * Get local media stream
 */
async function getLocalStream(video: boolean): Promise<MediaStream> {
    const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: video ? { facingMode: 'user' } : false,
    });
    return stream as MediaStream;
}

/**
 * Start a call to a peer
 */
export async function startCall(
    peerId: string,
    isVideo: boolean,
    stateCallback: (state: CallState) => void,
    streamCallback: (stream: MediaStream) => void
): Promise<MediaStream | null> {
    try {
        onStateChange = stateCallback;
        onRemoteStream = streamCallback;

        const peerConnection = createPeerConnection();
        const localStream = await getLocalStream(isVideo);

        // Add tracks to peer connection
        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream);
        });

        currentSession = {
            peerId,
            peerConnection,
            localStream,
            remoteStream: null,
            state: 'calling',
            isVideo,
        };

        updateState('calling');

        // Create and send offer
        const offer = await peerConnection.createOffer({});
        await peerConnection.setLocalDescription(offer);

        await sendSignal('offer', {
            peerId,
            sdp: offer.sdp,
            type: offer.type,
        });

        return localStream;
    } catch (error) {
        console.error('Failed to start call:', error);
        endCall();
        return null;
    }
}

/**
 * Answer an incoming call
 */
export async function answerCall(
    peerId: string,
    offer: RTCSessionDescription,
    isVideo: boolean,
    stateCallback: (state: CallState) => void,
    streamCallback: (stream: MediaStream) => void
): Promise<MediaStream | null> {
    try {
        onStateChange = stateCallback;
        onRemoteStream = streamCallback;

        const peerConnection = createPeerConnection();
        const localStream = await getLocalStream(isVideo);

        localStream.getTracks().forEach((track) => {
            peerConnection.addTrack(track, localStream);
        });

        currentSession = {
            peerId,
            peerConnection,
            localStream,
            remoteStream: null,
            state: 'ringing',
            isVideo,
        };

        await peerConnection.setRemoteDescription(offer);

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        await sendSignal('answer', {
            peerId,
            sdp: answer.sdp,
            type: answer.type,
        });

        return localStream;
    } catch (error) {
        console.error('Failed to answer call:', error);
        endCall();
        return null;
    }
}

/**
 * Handle incoming signaling message
 */
export async function handleSignal(type: string, data: any): Promise<void> {
    if (!currentSession) return;

    try {
        switch (type) {
            case 'answer':
                await currentSession.peerConnection.setRemoteDescription(
                    new RTCSessionDescription({ type: data.type, sdp: data.sdp })
                );
                break;

            case 'ice-candidate':
                await currentSession.peerConnection.addIceCandidate(
                    new RTCIceCandidate(data.candidate)
                );
                break;

            case 'hangup':
                endCall();
                break;
        }
    } catch (error) {
        console.error('Failed to handle signal:', error);
    }
}

/**
 * End the current call
 */
export function endCall(): void {
    if (currentSession) {
        currentSession.localStream?.getTracks().forEach((track) => track.stop());
        currentSession.peerConnection.close();

        sendSignal('hangup', { peerId: currentSession.peerId });

        updateState('ended');
        currentSession = null;
    }

    onStateChange = null;
    onRemoteStream = null;
}

/**
 * Toggle mute
 */
export function toggleMute(): boolean {
    if (!currentSession?.localStream) return false;

    const audioTrack = currentSession.localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        return audioTrack.enabled;
    }
    return false;
}

/**
 * Toggle camera
 */
export function toggleCamera(): boolean {
    if (!currentSession?.localStream) return false;

    const videoTrack = currentSession.localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        return videoTrack.enabled;
    }
    return false;
}

/**
 * Get current call state
 */
export function getCallState(): CallState {
    return currentSession?.state || 'idle';
}
