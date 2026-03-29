import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export class ExternalBlob {
    getBytes(): Promise<Uint8Array<ArrayBuffer>>;
    getDirectURL(): string;
    static fromURL(url: string): ExternalBlob;
    static fromBytes(blob: Uint8Array<ArrayBuffer>): ExternalBlob;
    withUploadProgress(onProgress: (percentage: number) => void): ExternalBlob;
}
export interface SignalingData {
    answerSDP?: string;
    iceCandidatesAnswerer: Array<string>;
    offerSDP?: string;
    iceCandidatesOfferer: Array<string>;
}
export interface Message {
    id: bigint;
    msgType: string;
    blob?: ExternalBlob;
    text: string;
    sender: string;
    mediaUrl?: string;
    timestamp: bigint;
}
export interface backendInterface {
    addIceCandidateAnswerer(candidate: string): Promise<void>;
    addIceCandidateOfferer(candidate: string): Promise<void>;
    clearMessages(): Promise<void>;
    clearSignaling(): Promise<void>;
    getMessages(): Promise<Array<Message>>;
    getSignaling(): Promise<SignalingData | null>;
    sendMessage(text: string, sender: string, msgType: string | null, mediaUrl: string | null): Promise<void>;
    storeAnswer(sdp: string): Promise<void>;
    storeOffer(sdp: string): Promise<void>;
}
