import assert from 'assert';
import { EventEmitter } from 'events';
import * as mergeOptions from 'merge-options';

import { hex } from '../core/id-keys';



class VideoOutgoing extends EventEmitter {
    constructor(stream) {
        super();
        this.stream = stream;
    }

    static async acquire(constraints) {
        constraints = mergeOptions({video: true, audio: true}, constraints);
        var stream = await navigator.mediaDevices.getUserMedia(constraints);
        return new VideoOutgoing(stream);
    }

    dispatch(client) {
        var ovs;
        for (let {peer} of client.getPeers()) {
            peer._outgoingVideos = ovs = peer._outgoingVideos || new Set();
            if (!ovs.has(this)) {
                peer.addStream(this.stream);
                ovs.add(this);
            }
        }
    }

    embed(client, slot) {
        assert(!!client.id, "client not initialized");
        var objId = slot.set(new VideoIncoming(client.id, this.stream.id));
        client._outgoingVideos = client._outgoingVideos || new Map();
        client._outgoingVideos.set(this.stream.id, this);
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
    constructor(peerId, streamId) {
        this.$type = 'VideoIncoming';
        this.peerId = hex(peerId);
        this.streamId = streamId;
    }

    static from(props) {
        if (props.$type && props.$type !== 'VideoIncoming')
            console.warn(`expected a VideoIncoming, got $type = ${props.$type}`);
        return new VideoIncoming(props.peerId, props.streamId);
    }

    receive(client, peers) {
        peers = peers || client.getPeers();
        return this._scanSelf(client).concat(...
                 peers.map(x => this._scanPeer(x.peer)));
    }

    isRelevantPeer(id) { return hex(id) === this.peerId; }
    isRelevantStream(id) { return id === this.streamId; }

    _scanSelf(client) {
        if (this.isRelevantPeer(client.id) && client._outgoingVideos) {
            var ovs = client._outgoingVideos;
            ovs = this.streamId ? [ovs.get(this.streamId)] : [...ovs.values()];
            return ovs.map(x => x && x.stream).filter(x => x);
        }
        else return [];
    }
    _scanPeer(peer) {
        var remote = (peer && peer._remoteStreams) || [];
        return remote.filter(stream => this.isRelevantStream(stream.id)
                                       && stream.active);
    }
/*
    static receiveRemote(client, peers) {
        peers = peers || client.getPeers();
        return [].concat(...peers.map(peer => peer ? peer._remoteStreams : []))
            .filter(stream => stream.active);
    }*/

    static createVideoElement(stream, play=true) {
        var vid = document.createElement('video');
        vid.srcObject = stream;
        if (play) vid.play();
        return vid;
    }
}


export { VideoOutgoing, VideoIncoming }
