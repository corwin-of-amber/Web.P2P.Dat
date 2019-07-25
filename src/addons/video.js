const assert = require('assert');



class VideoOutgoing {
    constructor(stream) {
        this.stream = stream;
    }

    static async acquire(constraints) {
        constraints = constraints || {video: true};
        var stream = await navigator.mediaDevices.getUserMedia(constraints);
        return new VideoOutgoing(stream);
    }

    dispatch(client) {
        for (let id of client.peers.keys()) {
            var peer = client.getPeer(id);
            if (peer) peer.addStream(this.stream);
        }
    }

    embed(client, slot) {
        assert(!!client.id, "client not initialized");
        var objId = slot.set(new VideoIncoming(client.id));
        client._outgoingVideos = client._outgoingVideos || {};
        client._outgoingVideos[objId] = this;
        this.dispatch(client);
        return objId;
    }

    close() {
        for (let track of this.stream.getTracks()) {
            track.stop();
        }
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
