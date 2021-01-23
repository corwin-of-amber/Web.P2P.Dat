# Synchronous P2P Based on Dat

This is a framework that allows concurrent editing of JSON documents over
a P2P connection using the Automerge protocol.
The documents' history is shared and distributed to peers using Dat components, namely [hypercore](https://hypercore-protocol.org).

## Build & Run

This project uses [Kremlin](https://github.com/corwin-of-amber/Web.Kremlin)
to build.
Download and install Kremlin according to the instructions, then build with:
```
% kremlin index.html
```

To run with NW.js, run `nw` in the project root.

To run in a browser, serve files from `build/kremlin` and navigate to
`http://localhost/index.html`.