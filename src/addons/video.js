const assert = require('assert'),
      {EventEmitter} = require('events');



class VideoOutgoing extends EventEmitter {
    constructor(stream) {
        super();
        this.stream = stream;
    }

    static async acquire(constraints) {
        constraints = constraints || {video: true};
        var stream = await navigator.mediaDevices.getUserMedia(constraints);
        return new VideoOutgoing(stream);
    }

    dispatch(client) {
        for (let id of client.peers.keys()) {
            var peer = client.getPeer(id), ovs;
            if (peer) {
                peer._outgoingVideos = ovs = peer._outgoingVideos || new Set();
                if (!ovs.has(this)) {
                    peer.addStream(this.stream);
                    ovs.add(this);
                }
            }
        }
    }

    embed(client, slot) {
        assert(!!client.id, "client not initialized");
        var objId = slot.set(new VideoIncoming(client.id));
        client._outgoingVideos = client._outgoingVideos || new Map();
        client._outgoingVideos.set(objId, this);
        client.emit('video-outgoing', {video: this, objectId: objId});
        this.dispatch(client);
        return objId;
    }

    close() {
        for (let track of this.stream.getTracks()) {
            track.stop();
        }
        this.emit('close');
    }
}

class VideoIncoming {
    constructor(peerId) {
        this.$type = 'VideoIncoming';
        this.peerId = peerId;
    }

    static receive(stream, play=true) {
        var vid = document.createElement('video');
        vid.srcObject = stream;
        if (play) vid.play();
        return vid;
    }
}


module.exports = {VideoOutgoing, VideoIncoming};
