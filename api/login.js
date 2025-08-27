// api/diagrams2.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.DIAGRAMS_SUPABASE_URL,
  process.env.DIAGRAMS_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body; // e.g., { name: 'Functions' }

    const { data, error } = await supabase.functions.invoke('diagrams2', { body });

    if (error) return res.status(500).json({ error: error.message });

    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
