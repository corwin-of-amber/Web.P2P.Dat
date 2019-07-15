const webrtcSwarm = require('@geut/discovery-swarm-webrtc'),
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

        this.webrtc = webrtcSwarm({id, stream, hub});
    }
    join(channelName, opts) {
        const channelNameString = channelName.toString('hex');
        this.webrtc.join(channelNameString, opts);
    }
    leave(channelName) {
        const channelNameString = channelName.toString('hex');
        this.webrtc.leave(channelNameString);
    }
    close() {
        this.webrtc.close();
    }
}


module.exports = (opts) => new DiscoverySwarmWeb(opts)

module.exports.DiscoverySwarmWeb = DiscoverySwarmWeb
