// import "jsr:@supabase/functions-js/edge-runtime.d.ts" // See if this is really needed
// @deno-types="npm:@types/express@5.0.1"
import express from 'npm:express@5.0.1'
import { MessagingService } from '../_shared/services/messaging/messagingService.ts';

const app = express()
const port = 3000

app.use(express.json())
// app.use( express.json({ limit : "300kb" })); // If you want a payload larger than 100kb, then you can tweak it here:

app.post('/messaging', (req, res) => {
  const { name } = req.body
  res.send(`Hello 1 ${name}!`)
})

app.listen(port, () => {
  console.log(`Messaging app listening on port ${port}`)
})