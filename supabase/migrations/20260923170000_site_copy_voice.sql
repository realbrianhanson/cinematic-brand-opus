-- Site copy voice pass (brianhanson.com).
--
-- Brings the admin-editable article CTA and author bio in line with the site
-- voice: no closing periods, no em dashes, and the new Summit button label.
-- Every update is conditional on the exact current default, so any wording an
-- administrator has already changed is left alone. Facts are unchanged.

update public.site_settings
set cta_button_text = 'Save My Free Seat'
where cta_button_text = 'Reserve Your Free 3-Day Pass';

update public.site_settings
set cta_subtext = 'Join live online to explore AI tools for marketing, sales, content, and lead generation. Starting from scratch is fine'
where cta_subtext = 'Join the live online summit to explore AI tools, marketing, sales, content, and lead generation—even if you are starting from scratch.';

-- Drop only the closing period of the stored author bio.
update public.site_settings
set author_bio = left(author_bio, length(author_bio) - 1)
where author_bio = 'Brian Hanson is a 4x Inc. 5000 entrepreneur, founder of AI For Business, and AI educator who has helped more than 150,000 business owners put AI to work in marketing, sales, and operations. After building multiple multi-million dollar companies, he now teaches non-technical business owners how to automate and scale with AI, no coding required.';
