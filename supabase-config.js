// Frontend-safe Supabase configuration.
// Use ONLY the publishable key here. Never place the secret/service-role key in this file.
window.SUPABASE_URL = 'https://jeozpajbwuvvrrdojuyc.supabase.co';
window.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__iiNGS7WO0dNDCz-7kRSdQ_mGql_esr';

window.supabaseClient = window.supabase?.createClient
  ? window.supabase.createClient(
      window.SUPABASE_URL,
      window.SUPABASE_PUBLISHABLE_KEY
    )
  : null;
