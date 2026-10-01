// Frontend-safe Supabase configuration. NEVER put the secret/service-role key here.
window.SUPABASE_URL = 'https://jeozpajbwuvvrrdojuyc.supabase.co';
window.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__iiNGS7WO0dNDCz-7kRSdQ_mGql_esr';
window.supabaseClient = (window.supabase?.createClient) ? window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY) : null;
