var swarm = require('webrtc-swarm')
var //signalhub = require('signalhub'),
    signalhubws = require('signalhubws');

const node_require = require; /* bypass browserify */

const node_ws = (typeof WebSocket === 'undefined') ? node_require('websocket').w3cwebsocket : undefined;

var hub = //signalhub('swarm-example', ['https://signalhub-jccqtwhdwc.now.sh'])
    signalhubws('swarm-example', ['wss://signalhubws.mauve.moe'], node_ws);

var swarmConfig = (typeof RTCPeerConnection === 'undefined') ? {wrtc: node_require('wrtc')} : {};

var sw = swarm(hub, swarmConfig);


sw.on('peer', function (peer, id) {
  console.log('connected to a new peer:', id)
  console.log('total peers:', sw.peers.length)
  peer.on('data', (message) => {
      console.log(`message from peer ${id}:`, message.toString('utf-8'));
  });
})

sw.on('disconnect', function (peer, id) {
  console.log('disconnected from a peer:', id)
  console.log('total peers:', sw.peers.length)
})

function broadcast(message) {
  for (let p of sw.peers) p.send(message);
}

if (typeof window !== 'undefined') {
    Object.assign(window, {sw, broadcast});
}
