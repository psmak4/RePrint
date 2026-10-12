import { once } from 'node:events'
import { connect, createServer, type Server, type Socket } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startTcpProxy, type TcpProxy } from './tcp-proxy.js'

let target: Server
let targetConnections: number
let proxy: TcpProxy
const clients: Socket[] = []

beforeEach(async () => {
  targetConnections = 0
  target = createServer((socket) => {
    targetConnections += 1
    socket.pipe(socket) // echo
  })
  target.listen(0, '127.0.0.1')
  await once(target, 'listening')
  const address = target.address()
  if (address === null || typeof address === 'string') throw new Error('no target port')
  proxy = await startTcpProxy({ host: '127.0.0.1', port: address.port })
})

afterEach(async () => {
  for (const client of clients.splice(0)) client.destroy()
  await proxy.close()
  target.close()
})

async function openClient(): Promise<Socket> {
  const client = connect(proxy.port, '127.0.0.1')
  client.on('error', () => {})
  clients.push(client)
  await once(client, 'connect')
  return client
}

/** Resolves on close; `once` would reject on the ECONNRESET a severed proxy sends. */
function closed(socket: Socket): Promise<void> {
  return new Promise((resolve) => socket.on('close', () => resolve()))
}

async function echo(client: Socket, text: string): Promise<string> {
  client.write(text)
  const [data] = await once(client, 'data')
  return String(data)
}

describe('startTcpProxy', () => {
  it('forwards traffic to the target', async () => {
    const client = await openClient()
    expect(await echo(client, 'ping')).toBe('ping')
    expect(targetConnections).toBe(1)
  })

  it('drops open connections when severed', async () => {
    const client = await openClient()
    await echo(client, 'ping')
    const clientClosed = closed(client)
    proxy.sever()
    await clientClosed
  })

  it('closes new connections after severing without reaching the target', async () => {
    proxy.sever()
    const client = connect(proxy.port, '127.0.0.1')
    client.on('error', () => {})
    clients.push(client)
    await closed(client)
    expect(targetConnections).toBe(0)
  })

  it('keeps its port bound after severing, so nothing else can take it', async () => {
    proxy.sever()
    const squatter = createServer()
    squatter.listen(proxy.port, '127.0.0.1')
    const [error] = await once(squatter, 'error')
    expect((error as NodeJS.ErrnoException).code).toBe('EADDRINUSE')
  })
})
