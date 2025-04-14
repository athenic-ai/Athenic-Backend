import { serve } from "https://deno.land/std@0.131.0/http/server.ts";

console.log("Agents function initializing...");

serve(async (req) => {
  return new Response(
    JSON.stringify({ 
      status: "ok", 
      message: "Agents API stub - full implementation coming soon" 
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
