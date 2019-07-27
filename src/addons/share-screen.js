const {VideoOutgoing} = require('./video');



class ScreenShare {

    static acquire() {
        return new this().acquire();
    }

    async acquire() {
        var conf = await this._obtainVideoConf(),
            stream = await this._obtainStream(conf);

        console.log(conf, stream);

        return new VideoOutgoing(stream);
    }

    _obtainStream(conf) {
        conf = {audio: false, video: conf};
        return navigator.mediaDevices.getUserMedia(conf);
    }
}

/**
 * Implement screen acquisition using the Screen Sharing API available
 * on Chrome and Firefox.
 */
class BroswerScreenShare extends ScreenShare {

    _obtainVideoConf() {
        return true;
    }

    _obtainStream(conf) {
        conf = {audio: false, video: conf};
        return navigator.mediaDevices.getDisplayMedia(conf);
    }
}

/**
 * Implement screen acquisition using nw.Screen (naturally, this is NWjs-specific).
 */
class NWjsScreenShare extends ScreenShare {

    constructor(sources=['screen', 'window'], nameRegexp=undefined) {
        super();
        this.sources = sources;
        this.nameRegexp = nameRegexp;
        this.timeout = 1000;
    }

    _obtainVideoConf() {
        const s = nw.Screen, dcm = s.DesktopCaptureMonitor;

        s.Init();
    
        var stop = () => { dcm.stop(); dcm.removeAllListeners(); };

        if (dcm.started) stop();

        return new Promise((resolve, reject) => {
            dcm.on("added", (id, name, order, type, primary) => {
                console.log("[DesktopCaptureMonitor] stream", id, name, order, type, primary);
                if (this.nameRegexp && !name.match(this.nameRegexp))
                    return;

                clearTimeout(notfound);

                var conf = {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: dcm.registerStream(id),
                        maxWidth: 1920,
                        maxHeight: 1080
                    },
                    optional: []
                };
                stop();
                resolve(conf);
            });

            var notfound = setTimeout(() => { stop(); reject('not found'); },
                                      this.timeout);
        
            dcm.start(this.sources.includes('screen'),
                      this.sources.includes('window'));
        });
    }
    /*
    _obtainVideoConf() {
        var s = nw.Screen;
        
        s.Init();

        return new Promise((resolve, reject) => {
            s.chooseDesktopMedia(["window","screen"], (streamId) => {
                resolve({
                    mandatory: {
                        chromeMediaSource: 'desktop', 
                        chromeMediaSourceId: streamId,
                        maxWidth: 1920, 
                        maxHeight: 1080
                    }, 
                    optional: []
                });
            });
        });
    }*/
}



module.exports = {ScreenShare, BroswerScreenShare, NWjsScreenShare};
