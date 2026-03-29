import List "mo:core/List";
import Time "mo:core/Time";
import Migration "migration";
import MixinStorage "blob-storage/Mixin";
import Storage "blob-storage/Storage";

(with migration = Migration.run)
actor {
  include MixinStorage();

  type Message = {
    id : Nat;
    text : Text;
    sender : Text;
    timestamp : Int;
    msgType : Text;
    mediaUrl : ?Text;
    blob : ?Storage.ExternalBlob;
  };

  type SignalingData = {
    offerSDP : ?Text;
    answerSDP : ?Text;
    iceCandidatesOfferer : [Text];
    iceCandidatesAnswerer : [Text];
  };

  var nextId = 0;
  let messages = List.empty<Message>();
  var signaling : ?SignalingData = null;

  // Messaging Functions

  public shared ({ caller }) func sendMessage(text : Text, sender : Text, msgType : ?Text, mediaUrl : ?Text) : async () {
    let message : Message = {
      id = nextId;
      text;
      sender;
      timestamp = Time.now();
      msgType = switch (msgType) {
        case (null) { "text" };
        case (?t) { t };
      };
      mediaUrl;
      blob = null;
    };
    messages.add(message);
    nextId += 1;
  };

  public query ({ caller }) func getMessages() : async [Message] {
    messages.toArray();
  };

  public shared ({ caller }) func clearMessages() : async () {
    messages.clear();
    nextId := 0;
  };

  // WebRTC Signaling Functions

  public shared ({ caller }) func storeOffer(sdp : Text) : async () {
    let newSignaling = switch (signaling) {
      case (null) {
        {
          offerSDP = ?sdp;
          answerSDP = null;
          iceCandidatesOfferer = [];
          iceCandidatesAnswerer = [];
        };
      };
      case (?s) {
        {
          offerSDP = ?sdp;
          answerSDP = s.answerSDP;
          iceCandidatesOfferer = s.iceCandidatesOfferer;
          iceCandidatesAnswerer = s.iceCandidatesAnswerer;
        };
      };
    };
    signaling := ?newSignaling;
  };

  public shared ({ caller }) func storeAnswer(sdp : Text) : async () {
    switch (signaling) {
      case (null) {};
      case (?s) {
        let newSignaling = {
          offerSDP = s.offerSDP;
          answerSDP = ?sdp;
          iceCandidatesOfferer = s.iceCandidatesOfferer;
          iceCandidatesAnswerer = s.iceCandidatesAnswerer;
        };
        signaling := ?newSignaling;
      };
    };
  };

  public shared ({ caller }) func addIceCandidateOfferer(candidate : Text) : async () {
    switch (signaling) {
      case (null) {};
      case (?s) {
        let newSignaling = {
          offerSDP = s.offerSDP;
          answerSDP = s.answerSDP;
          iceCandidatesOfferer = s.iceCandidatesOfferer.concat([candidate]);
          iceCandidatesAnswerer = s.iceCandidatesAnswerer;
        };
        signaling := ?newSignaling;
      };
    };
  };

  public shared ({ caller }) func addIceCandidateAnswerer(candidate : Text) : async () {
    switch (signaling) {
      case (null) {};
      case (?s) {
        let newSignaling = {
          offerSDP = s.offerSDP;
          answerSDP = s.answerSDP;
          iceCandidatesOfferer = s.iceCandidatesOfferer;
          iceCandidatesAnswerer = s.iceCandidatesAnswerer.concat([candidate]);
        };
        signaling := ?newSignaling;
      };
    };
  };

  public shared ({ caller }) func getSignaling() : async ?SignalingData {
    signaling;
  };

  public shared ({ caller }) func clearSignaling() : async () {
    signaling := null;
  };
};

