import "jsr:@supabase/functions-js/edge-runtime.d.ts" // See if this is really needed
import express from 'npm:express@4.18.2'

const app = express()
app.use(express.json())
// app.use( express.json({ limit : "300kb" })); // If you want a payload larger than 100kb, then you can tweak it here:

const port = 3000

app.get('/hello-world', (req, res) => {
  res.send('Hello World!')
})

app.post('/hello-world', (req, res) => {
  const { name } = req.body
  res.send(`Hello ${name}!`)
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})