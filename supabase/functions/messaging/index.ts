// import "jsr:@supabase/functions-js/edge-runtime.d.ts" // See if this is really needed
// @deno-types="npm:@types/express@5.0.1"
import express from 'npm:express@5.0.1'
import { MessagingService } from './messagingService.ts';

const app = express()
const port = 3000

app.use(express.json())
// app.use( express.json({ limit : "300kb" })); // If you want a payload larger than 100kb, then you can tweak it here:

app.post('/messaging', (req, res) => {
  const { name } = req.body
  res.send(`Hello 1 ${name}!`)
})

app.post('/messaging/auth/:connection', async (req, res) => {
  try {
    console.log("/messaging/auth/:connection started");
    const connection = req.params.connection
    const connectionMetadata: Map<string, any> = new Map(Object.entries(req.body));
    console.log(`/messaging/auth/:connection with connection: ${connection} and connectionMetadata: ${JSON.stringify(connectionMetadata)}`)
    const result = await MessagingService.auth(connection, connectionMetadata);
    res.json({ success: true, data: result });
    // res.send(`Hello with connection ${connection}!`)
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
})

app.listen(port, () => {
  console.log(`Messaging app listening on port ${port}`)
})