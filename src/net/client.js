import { EventEmitter } from 'events';
import randomBytes from 'randombytes';
import pump from 'pump';
import mergeOptions from 'merge-options';

import WebRTCSwarm from 'webrtc-swarm';
import signalhubws from 'signalhubws';
import subsignalhub from 'sub-signalhub';
import ram from 'random-access-memory';

import deferred from '../core/deferred';
import { HexKeyedMap, hex } from '../core/id-keys';
import { ObservableSet, fwd } from '../core/reactive';
import { FeedCrowd } from './crowd';



/* This can work in node as well, but switching to discovery-swarm-web would require a tiny patch */
const node_require = require, /* bypass browserify */
      node_ws = (typeof WebSocket === 'undefined') ? node_require('websocket').w3cwebsocket : undefined,
      wrtc = (typeof RTCPeerConnection === 'undefined') ? node_require('wrtc') : undefined;


const DEFAULT_OPTIONS = {
        appName: 'dat-p2p-crowd',
        servers: {hub: 'wss://amberhubws.herokuapp.com'}
        //servers: {hub: 'ws://localhost:3300'}
    };



class SwarmClient extends EventEmitter {

    constructor(opts) {
        super();
        this.opts = mergeOptions(DEFAULT_OPTIONS, opts);
        this.id = this.opts.id || randomBytes(32);
        this.deferred = {init: deferred()};

        this.channels = new Map();
        this.activeChannels = new ObservableSet();

        this.opened = false;
    }

    init() {
        return this._initPromise || (this._initPromise = this._init()
                                     .then(() => this.deferred.init.resolve()));
    }

    _init() {
        return new Promise((resolve, reject) => {
            this.hub =
                signalhubws(this.opts.appName, [this.opts.servers.hub], node_ws);

            this.hub.once('open', () => {
                this.opened = true;
                this._registerCloseEvents();
                resolve(); this.emit('init');
            });

            console.log(`me: %c${this.id.toString('hex')}`, 'color: green;');
            this._registerReconnect();
        });
    }

    async join(channel) {
        var s = new SwarmClient.Channel(this, channel);
        fwd(s, ['peer:join', 'peer:ready', 'peer:leave'], this);
        this.channels.set(channel, s);

        await this.init();
        if (!s.swarm) s.join();  // in case client was not ready before
        this.activeChannels.add(channel);
    }

    close() {
        this._unregisterReconnect();
        if (this.hub) this.hub.close();
        for (let chan of this.channels.values()) {
            chan.leave();
        }
        this.activeChannels.clear();
        this.opened = false;
        this._initPromise = null;
    }

    async reconnect() {
        var timestamp = new Date().toLocaleTimeString();
        console.log(`%c- reconnect - %c${timestamp}`, 'color: red;', 'color: #ccc');
        this.close();
        
        await this.init();
        for (let chan of this.channels.values()) chan.join();
    }

    /**
     * Finds the SimplePeer instance associated with a peer.
     * @param {string|Uint8Array|Wire} id peer id, or a Wire instance
     * @param {string} channel channel name; if omitted, looks in all channels
     */
    getPeer(id, channel=undefined) {
        if (id.id) id = id.id;

        var channels = channel ? [this.channels.get(channel)].filter(x => x)
                               : this.channels.values()

        for (let chan of channels) {
            var p = chan.peers.get(id);
            if (p) return {id, ...p};
        }
    }

    getPeers(channel=undefined) {
        var channels = channel ? [this.channels.get(channel)].filter(x => x)
                               : [...this.channels.values()]

        return [].concat(...
            channels.map(chan => [...chan.peers.entries()]
                .map(([id, p]) => ({id, ...p}))));
    }

    _registerCloseEvents() {
        for (let s of this.hub.sockets) s.onclose = () => this.emit('disconnect');
    }

    _registerReconnect() {
        if (!this._reconnectHandler) {
            this._reconnectHandler = () => this.reconnect();
            this.on('disconnect', this._reconnectHandler);
        }
    }

    _unregisterReconnect() {
        if (this._reconnectHandler) {
            this.removeListener('disconnect', this._reconnectHandler);
            this._reconnectHandler = null;
        }
    }
}

/**
 * Represents a connection to a channel in a Signalhub.
 * (using subsignalhub.)
 */
SwarmClient.Channel = class extends EventEmitter {

    constructor(client, name, opts={}) {
        super();
        this.client = client;
        this.name = name;
        this.opts = opts;

        this.peers = new HexKeyedMap();
        if (this.client.hub) this.join();
    }

    join() {
        var hub = this.client.hub, uuid = hex(this.client.id);
        this.hub = this.name ? subsignalhub(hub, `:${this.name}:`) : hub;

        this.swarm = WebRTCSwarm(this.hub, {wrtc, uuid, ...this.opts});
        this.swarm.on('peer', (peer, id) => {
            this.peers.set(id,
                {peer, wire: this._handle(peer, id)});
            this.emit('peer:join', {id, peer});
        });
        this.swarm.on('disconnect', (peer, id) => {
            this.peers.delete(id);
            this.emit('peer:leave', {id, peer});
        });
    }

    leave() {
        if (this.swarm)
            this.swarm.close();
        this.swarm = undefined;
    }

    _handle(peer, id) {
        if (this.client.opts.stream) {
            const wire = this.client.opts.stream({id, channel: this,
                                                  initiator: peer.initiator});
            wire.on('handshake', () => this.emit('peer:ready', {id, peer}));
            pump(peer, wire, peer)
            return wire;
        }
    }        
}


class FeedClient extends SwarmClient {

    constructor(opts) {
        super(mergeOptions({
            stream: info => this._stream(info)
        }, opts));

        this.peers = new HexKeyedMap();

        this.crowd = new FeedCrowd({storage: ram, feed: {valueEncoding: 'json'}, 
                                    extensions: ['shout']});

        this.crowd.on('feed:append', feed => this.onAppend(feed));
        this.crowd.on('feed:error', (feed, e) => this.onError(feed, e));
        this.crowd.on('error',  e => this.onError(null, e));

        this.on('peer-disconnect', (peer, info) => this._removePeer(info.id));
    }

    _stream(info) {
        console.log('stream', info);
        try {
            var wire = this.crowd.replicate(info.initiator, {id: info.id});
            this.peers.set(info.id, wire);
            return wire.chunked();
        }
        catch (e) { console.error(e); }
    }

    async create(opts, meta, asMaster) {
        var feed = await this.crowd.create(opts, meta);
        
        if (asMaster || (!this.feed && !(asMaster === false))) {
            this.feed = feed;
        }

        return feed;
    }

    _removePeer(id) {
        this.peers.delete(id);
    }

    get key() {
        return this.crowd.longKey(this.feed);
    }

    async onAppend(feed) {
        //console.log("feed.append", this.crowd.shortKey(), this.crowd.shortKey(feed), feed.length);

        if (feed.opts && feed.opts.sparse && !feed.opts.eagerUpdate) return;

        var from = feed.lastLength, to = feed.length;
        feed.lastLength = feed.length;

        for (let i = from; i < to; i++) {
            await this._feedGet(feed, i).then(item => {
                //console.log(this.crowd.shortKey(feed), i, item);
                this.emit('feed:append', {me: this.key, from: this.crowd.longKey(feed), feed, 
                    index: i, data: item})
            })
            .catch(e => this.onError(feed, e));
        }
    }

    onError(feed, e) {
        console.error('[feed error]', this.crowd.shortKey(feed), e);
    }

    _feedGet(feed, i) {
        return new Promise((resolve, reject) =>
            feed.get(i, (err, data) => err ? reject(err) : resolve(data)));
    }
}



module.exports = {SwarmClient, FeedClient};
