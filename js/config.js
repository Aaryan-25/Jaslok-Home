/* Jaslok Homecare — connection settings.
   The Supabase "publishable" key is designed to be public: it can only call the
   functions in supabase/setup.sql, which check every login themselves.
   Restrict the Ola Maps key to your website address in the Ola Maps console. */
window.JH_CONFIG = {
  supabaseUrl: 'https://bujjnnvuhvctrggrnhty.supabase.co',
  supabaseKey: 'sb_publishable_XtrwDnPXjQz1wm6iUrOqyQ_CIeE8wZo',
  olaMapsKey:  'C7lhqxEaqQmrkRxoY90u9EfslCK0',
  officePhone: '+91 73 0190 0190',
  officeWhatsApp: '917301900190'   // number used for "WhatsApp us" buttons (country code + number, no +)
};
