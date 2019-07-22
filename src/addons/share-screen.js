

class ScreenShare {

    async start() {
        var conf = await this._obtainVideoConf(),
            stream = await this._obtainStream(conf);

        console.log(conf, stream);

        return this.constructor.receive(stream);
    }

    static receive(stream, play=true) {
        var vid = document.createElement('video');
        vid.srcObject = stream;
        if (play) vid.play();
        return vid;
    }

    _obtainStream(conf) {
        conf = {audio: false, video: conf};
        return new Promise((resolve, reject) => {
            navigator.webkitGetUserMedia(conf, resolve, reject);
        });
    }
}

/**
 * Implement screen acquisition using nw.Screen (naturally, this is NWjs-specific).
 */
class NWjsScreenShare extends ScreenShare {

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

        // TODO try to use DesktopCaptureMonitor.registerStream like in
        //  https://github.com/nwjs/nw.js/issues/4459  ??
    }
}



module.exports = {ScreenShare, NWjsScreenShare};
