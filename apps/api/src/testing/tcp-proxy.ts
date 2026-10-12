import { once } from 'node:events'
import { createConnection, createServer, type Socket } from 'node:net'

export interface TcpProxy {
  /** The local port clients connect to (on 127.0.0.1). */
  port: number
  /** Drops every open connection and resets new ones, but keeps the port bound. */
  sever: () => void
  /** Drops every connection and releases the port. */
  close: () => Promise<void>
}

/**
 * A TCP proxy on a port this process owns. Integration tests connect through it so that
 * "stopping" a dependency is deterministic: once severed, the port stays held by the proxy,
 * so Docker can't hand it to a container another test file starts in parallel.
 */
export async function startTcpProxy(target: { host: string; port: number }): Promise<TcpProxy> {
  const sockets = new Set<Socket>()
  let severed = false
  const track = (socket: Socket) => {
    sockets.add(socket)
    socket.on('error', () => {}) // the peer's close below is what matters
    socket.on('close', () => sockets.delete(socket))
  }
  const server = createServer((client) => {
    track(client)
    if (severed) {
      client.resetAndDestroy()
      return
    }
    const upstream = createConnection(target)
    track(upstream)
    client.on('close', () => upstream.destroy())
    upstream.on('close', () => client.destroy())
    client.pipe(upstream).pipe(client)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('proxy has no TCP port')
  const dropAll = () => {
    for (const socket of sockets) socket.destroy()
  }
  return {
    port: address.port,
    sever: () => {
      severed = true
      dropAll()
    },
    close: async () => {
      severed = true
      dropAll()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
