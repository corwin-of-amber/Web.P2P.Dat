# Update simple-peer inside webrtc-swarm to latest
cp /tmp/node_modules/simple-peer/index.js node_modules/webrtc-swarm/node_modules/simple-peer/index.js

# discovery-swarm-web
patch -N -p1 -d node_modules/discovery-swarm-web < etc/patches/discovery-swarm-web.patch || true