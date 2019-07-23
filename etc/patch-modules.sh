
# discovery-swarm-web
# (allow to run in Node)
patch -N -p1 -d node_modules/discovery-swarm-web < etc/patches/discovery-swarm-web.patch || true

# @geut/discovery-swarm-webrtc
# (force installed webrtc-swarm)
rm -rf node_modules/@geut/discovery-swarm-webrtc/node_modules/webrtc-swarm
