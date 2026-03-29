import List "mo:core/List";
import Storage "blob-storage/Storage";

module {
  type OldMessage = {
    id : Nat;
    text : Text;
    sender : Text;
    timestamp : Int;
  };

  type OldActor = {
    nextId : Nat;
    messages : List.List<OldMessage>;
  };

  type NewMessage = {
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

  type NewActor = {
    nextId : Nat;
    messages : List.List<NewMessage>;
    signaling : ?SignalingData;
  };

  public func run(old : OldActor) : NewActor {
    let newMessages = old.messages.map<OldMessage, NewMessage>(
      func(oldMsg) {
        {
          id = oldMsg.id;
          text = oldMsg.text;
          sender = oldMsg.sender;
          timestamp = oldMsg.timestamp;
          msgType = "text";
          mediaUrl = null;
          blob = null;
        };
      }
    );
    {
      nextId = old.nextId;
      messages = newMessages;
      signaling = null;
    };
  };
};
