import assert from 'assert';
import { EventEmitter } from 'events';
import randomBytes from 'randombytes';
import pump from 'pump';
import mergeOptions from 'merge-options';
import through2 from 'through2';

import WebRTCSwarm from '@corwin.amber/webrtc-swarm';
import signalhubws from 'signalhubws';
import subsignalhub from 'sub-signalhub';
import ram from 'random-access-memory';

import deferred from '../core/deferred';
import { HexKeyedMap, hex } from '../core/id-keys';
import { ObservableSet, fwd } from '../core/reactive';
import { FeedCrowd } from './crowd';



/* Node compatibility layer: websockets and webrtc */
const node_require = require, /* bypass browserify */
      node_ws = (typeof WebSocket === 'undefined') ? node_require('websocket').w3cwebsocket : undefined,
      wrtc = (typeof RTCPeerConnection === 'undefined') ? node_require('@koush/wrtc') : undefined;


const DEFAULT_OPTIONS = {
        appName: 'ronin-p2p',
        servers: {
            hub: 'wss://pl.cs.technion.ac.il/wh',      // my server :P
            //hub: 'wss://pwr.zapto.org',              // my server :P
            //hub: 'wss://amberhubws.herokuapp.com',   // my server :P
            ice: [
                {urls: ['stun:stun.l.google.com:19302',
                        'stun:global.stun.twilio.com:3478']},
                {urls: ['turn:pwr.zapto.org:3478'],  // my server :P
                 username: 'power',
                 credential: 'to-the-people'}
            ]
        }
    };

/* Use these options for connecting via a host-local webrtc-hub */
const LOCAL_OPTIONS = {
        servers:{
            hub: 'ws://localhost:3300',
            ice: [
                {urls: ['turn:localhost:3478'],
                 username: 'power',
                 credential: 'to-the-people'}
            ]
    }};



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

            this.hub.subscribe('*').pipe(through2.obj(data => {
                if (data.motd) this._configureFromMotd(data.motd);
            }));

            this.hub.once('open', () => {
                this.opened = true;
                this._registerCloseEvents();
                resolve(); this.emit('init');
            });

            this.hub.on('error', (err) => { 
                console.warn('[signalhub connection]', err.url, err.event);
                if (!this.opened) this.emit('disconnect');
            });

            console.log(`me: %c${this.id.toString('hex')}`, 'color: green;');
            this._registerReconnect();
        });
    }

    async join(channel, ChannelClass=SwarmClient.StandardChannel) {
        var s = this.channels.get(channel);
        if (!s) {
            s = new ChannelClass(this, channel, this._channelOptions());
            fwd(s, ['peer:join', 'peer:ready', 'peer:leave'], this);
            this.channels.set(channel, s);
        }

        await this.init();
        if (!s.isActive) s.join();  // in case client was not ready before
        this.activeChannels.add(channel);
        return s;
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
        var now = new Date();
        if (this._lastReconnect && now - this._lastReconnect < 1000) {
            setTimeout(() => !this.opened && this.reconnect(), 5000);
            return;
        }
        else this._lastReconnect = now;

        var timestamp = now.toLocaleTimeString();
        console.log(`%c- reconnect - %c${timestamp}`, 'color: red;', 'color: #ccc');
        this.close();
        
        await this.init();
        for (let chan of this.channels.values()) {
            chan.join();
            this.activeChannels.add(chan.name);
        }
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

    _channelOptions() {
        var iceServers = this.opts.servers?.ice,
            opts = iceServers ? {config: {iceServers}} : {};
        /** allow to config other options */
        if (this.opts.connection)
            opts = mergeOptions(opts, this.opts.connection);
        return opts;
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

    _configureFromMotd(motd) {
        let ice = this.opts.servers?.ice;
        if (motd.ice && ice && !ice.some(e => JSON.stringify(e) == JSON.stringify(motd.ice))) {
            ice.push(motd.ice);
        }
    }
}

/**
 * A mock channel that connects two client instances in
 * the same process.
 */
SwarmClient.DirectChannel = class extends EventEmitter {

    constructor(client, name, opts={}) {
        super();
        this.client = client;
        this.name = name;
        this.opts = opts;
    }

    join() { }
    leave() { }

    connectTo(other) {
        other._handle(this._open(other.client.id, true), this.client.id);
    }

    _handle(peer, id) {
        const wire = this._open(id, false);
        if (wire) {
            pump(peer, wire, peer)
            return wire;
        }
    }

    _open(id, initiator) {
        if (this.client.opts.stream) {
            const wire = this.client.opts.stream({id, channel: this,
                                                  initiator});
            wire.on('handshake', () => this.emit('peer:ready', {id}));
            return wire;
        }
    }

    isActive() { return true; }
}

/**
 * Represents a connection to a channel in a Signalhub.
 * (using subsignalhub.)
 */
SwarmClient.StandardChannel = class extends EventEmitter {

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
        assert(hub);
        this.hub = this.name ? subsignalhub(hub, `:${this.name}:`) : hub;

        assert(!this.swarm);
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

    get isActive() { return !!this.swarm; }

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
            storageFactory: () => ram,
            stream: info => this._stream(info)
        }, opts));

        this.crowd = new FeedCrowd({storageFactory: this.opts.storageFactory,
                                    //feed: {valueEncoding: 'json'}, 
                                    extensions: ['shout']});

        this.crowd.on('feed:ready', feed => this.onAppend(feed));
        this.crowd.on('feed:append', feed => this.onAppend(feed));
        this.crowd.on('feed:error', (feed, e) => this.onError(feed, e));
        this.crowd.on('error',  e => this.onError(null, e));
    }

    _stream(info) {
        console.log('stream', {id: info.id, initiator: info.initiator});
        try {
            var wire = this.crowd.replicate(info.initiator, {id: info.id});
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



export { SwarmClient, FeedClient, DEFAULT_OPTIONS, LOCAL_OPTIONS }
