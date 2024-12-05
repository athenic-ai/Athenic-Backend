// Setup type definitions for built-in Supabase Runtime APIs
// import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import express from 'npm:express@5.0.1'

console.log("Hello from Functions!")


const app = express()
app.use(express.json())
// If you want a payload larger than 100kb, then you can tweak it here:
// app.use( express.json({ limit : "300kb" }));

const port = 3000

app.get('/slack-auth-callback', (req, res) => {
  res.send('Hello World!')
})

app.post('/slack-auth-callback', (req, res) => {
  const { name } = req.body
  res.send(`Hello ${name}!`)
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})


/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/slack-auth-callback' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --header 'Content-Type: application/json' \
    --data '{"name":"Functions"}'

*/
