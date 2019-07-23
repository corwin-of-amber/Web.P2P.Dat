const webrtcSwarm = require('@geut/discovery-swarm-webrtc'),
      subsignalhub = require('sub-signalhub'),
      randomBytes = require('randombytes'),
      {EventEmitter} = require('events');


/**
 * A thin adapter around @geut/discovery-swarm-webrtc, to allow switching
 * with discovery-swarm-web if a discovery gateway is desired.
 */
class DiscoverySwarmWeb  extends EventEmitter {
    constructor(opts) {
        super();

        const id = opts.id || randomBytes(32);
        const stream = opts.stream;
        const hub = opts.signalhub;

        this.id = id;
        this.stream = stream;
        this.hub = hub;

        this.channels = new Set();

        this.webrtc = webrtcSwarm({id: id.toString('hex'), stream, hub});
        this.webrtc.on('close', () => { this.channels.clear(); });
    }
    join(channelName, opts) {
        if (this.channels.has(channelName)) return;  // ignore silently

        const channelNameString = channelName.toString('hex'),
              subhub = subsignalhub(this.hub, `:${channelNameString}:`);
        this.webrtc.join(subhub, opts);
        this.channels.add(channelName);
    }
    leave(channelName) {
        const channelNameString = channelName.toString('hex'),
              subhub = subsignalhub(this.hub, `:${channelNameString}:`);
        // no DiscoverSwarmWebrtc.leave :(
        // TODO
        this.channels.delete(channelName);
    }
    close() {
        this.webrtc.close();
    }
}


module.exports = (opts) => new DiscoverySwarmWeb(opts)

module.exports.DiscoverySwarmWeb = DiscoverySwarmWeb
