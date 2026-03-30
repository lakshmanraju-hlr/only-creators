-- ─────────────────────────────────────────────────────────────────
-- DUMMY SEED DATA — for development / testing only
-- Run in Supabase SQL Editor (uses service role, bypasses RLS)
-- Creates 10 dummy users + profiles + posts across different fields
-- NOTE: these are profile-only entries; they cannot log in
-- ─────────────────────────────────────────────────────────────────

-- Step 1: Insert dummy auth.users (no real password needed for testing)
INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  created_at, updated_at,
  raw_user_meta_data, confirmation_token, recovery_token,
  raw_app_meta_data
) VALUES
  ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000001','authenticated','authenticated','marco.romano@test.oc','','2024-01-01 00:00:00+00','2024-01-01','2024-01-01','{"full_name":"Marco Romano","username":"marcoromano"}','','','{"provider":"email","providers":["email"]}'),
  ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000002','authenticated','authenticated','priya.nair@test.oc','','2024-01-01 00:00:00+00','2024-01-01','2024-01-01','{"full_name":"Priya Nair","username":"priyanair"}','','','{"provider":"email","providers":["email"]}'),
  ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000003','authenticated','authenticated','david.chen@test.oc','','2024-01-01 00:00:00+00','2024-01-01','2024-01-01','{"full_name":"David Chen","username":"davidchen"}','','','{"provider":"email","providers":["email"]}'),
  ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000004','authenticated','authenticated','elena.vasquez@test.oc','','2024-01-01 00:00:00+00','2024-01-01','2024-01-01','{"full_name":"Elena Vasquez","username":"elenavasquez"}','','','{"provider":"email","providers":["email"]}'),
  ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000005','authenticated','authenticated','james.okafor@test.oc','','2024-01-01 00:00:00+00','2024-01-01','2024-01-01','{"full_name":"James Okafor","username":"jamesokafor"}','','','{"provider":"email","providers":["email"]}'),
  ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000006','authenticated','authenticated','sophie.muller@test.oc','','2024-01-01 00:00:00+00','2024-01-01','2024-01-01','{"full_name":"Sophie Müller","username":"sophiemuller"}','','','{"provider":"email","providers":["email"]}'),
  ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000007','authenticated','authenticated','raj.patel@test.oc','','2024-01-01 00:00:00+00','2024-01-01','2024-01-01','{"full_name":"Raj Patel","username":"rajpatel"}','','','{"provider":"email","providers":["email"]}'),
  ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000008','authenticated','authenticated','amara.diallo@test.oc','','2024-01-01 00:00:00+00','2024-01-01','2024-01-01','{"full_name":"Amara Diallo","username":"amaradiallo"}','','','{"provider":"email","providers":["email"]}'),
  ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000009','authenticated','authenticated','isabella.rossi@test.oc','','2024-01-01 00:00:00+00','2024-01-01','2024-01-01','{"full_name":"Isabella Rossi","username":"isabellarossi"}','','','{"provider":"email","providers":["email"]}'),
  ('00000000-0000-0000-0000-000000000000','11111111-0000-0000-0000-000000000010','authenticated','authenticated','nathan.park@test.oc','','2024-01-01 00:00:00+00','2024-01-01','2024-01-01','{"full_name":"Nathan Park","username":"nathanpark"}','','','{"provider":"email","providers":["email"]}')
ON CONFLICT (id) DO NOTHING;

-- Step 2: Insert profiles
INSERT INTO public.profiles (id, username, full_name, bio, profession, role_title, is_pro, follower_count, post_count) VALUES
  ('11111111-0000-0000-0000-000000000001','marcoromano','Marco Romano','Street and portrait photographer based in Milan. I chase light and candid moments.','photographer','Street Photographer',true,142,0),
  ('11111111-0000-0000-0000-000000000002','priyanair','Priya Nair','Classical Carnatic singer exploring the overlap with contemporary music.','singer','Vocalist',true,98,0),
  ('11111111-0000-0000-0000-000000000003','davidchen','David Chen','Composer and multi-instrumentalist. Jazz, ambient, everything in between.','musician','Composer & Multi-Instrumentalist',true,203,0),
  ('11111111-0000-0000-0000-000000000004','elenavasquez','Elena Vasquez','Visual artist working in oil and mixed media. Obsessed with texture.','visual-artist','Visual Artist',true,317,0),
  ('11111111-0000-0000-0000-000000000005','jamesokafor','James Okafor','Documentary filmmaker. Currently working on a series about urban green spaces.','filmmaker','Documentary Filmmaker',true,89,0),
  ('11111111-0000-0000-0000-000000000006','sophiemuller','Sophie Müller','Poet and essayist. Words are my medium, silence is my canvas.','poet','Poet & Essayist',true,74,0),
  ('11111111-0000-0000-0000-000000000007','rajpatel','Raj Patel','Software engineer turned indie hacker. Building tools for creators.','technology','Full-Stack Engineer',true,256,0),
  ('11111111-0000-0000-0000-000000000008','amaradiallo','Amara Diallo','Personal trainer and sports nutritionist. Movement is medicine.','fitness','Personal Trainer & Nutritionist',true,188,0),
  ('11111111-0000-0000-0000-000000000009','isabellarossi','Isabella Rossi','Chef and food stylist. I cook because the world needs more beauty on a plate.','culinary','Chef & Food Stylist',true,134,0),
  ('11111111-0000-0000-0000-000000000010','nathanpark','Nathan Park','Contemporary dancer and choreographer. Movement as language.','dancer','Choreographer',true,91,0)
ON CONFLICT (id) DO NOTHING;

-- Step 3: Insert discipline_personas (they earned Pro through posting)
INSERT INTO public.discipline_personas (user_id, discipline, level, post_count) VALUES
  ('11111111-0000-0000-0000-000000000001','photographer','contributor',4),
  ('11111111-0000-0000-0000-000000000002','singer','newcomer',2),
  ('11111111-0000-0000-0000-000000000003','musician','contributor',3),
  ('11111111-0000-0000-0000-000000000004','visual-artist','expert',7),
  ('11111111-0000-0000-0000-000000000005','filmmaker','newcomer',2),
  ('11111111-0000-0000-0000-000000000006','poet','newcomer',3),
  ('11111111-0000-0000-0000-000000000007','technology','contributor',4),
  ('11111111-0000-0000-0000-000000000008','fitness','contributor',3),
  ('11111111-0000-0000-0000-000000000009','culinary','newcomer',2),
  ('11111111-0000-0000-0000-000000000010','dancer','newcomer',2)
ON CONFLICT (user_id, discipline) DO NOTHING;

-- Step 4: Insert posts
-- Photography
INSERT INTO public.posts (user_id, content_type, caption, tags, post_type, is_pro_post, persona_discipline, visibility, pro_upvote_count, like_count, comment_count, created_at) VALUES
  ('11111111-0000-0000-0000-000000000001','text','Golden hour in the Navigli district. The light was perfect — caught this just before the tourists arrived. #milan #streetphotography #goldenhour','{"#milan","#streetphotography","#goldenhour"}','pro',true,'photographer','public',5,23,4,'2025-03-28 09:15:00+00'),
  ('11111111-0000-0000-0000-000000000001','text','Tried shooting portraits in harsh midday light today — usually a nightmare, but I wanted to lean into the shadows. Hard light can be a feature, not a bug.','{"#portraiture","#lighting","#technique"}','pro',true,'photographer','public',3,17,2,'2025-03-27 14:22:00+00'),
  ('11111111-0000-0000-0000-000000000001','text','Just got back from a 3-day solo trip to the Dolomites. Shot 12 rolls of film. Can''t wait to develop them.','{}','general',false,null,'public',0,31,7,'2025-03-26 18:40:00+00');

-- Vocals & Singing
INSERT INTO public.posts (user_id, content_type, caption, tags, post_type, is_pro_post, persona_discipline, visibility, pro_upvote_count, like_count, comment_count, created_at) VALUES
  ('11111111-0000-0000-0000-000000000002','text','Spent the morning practising Raag Bhairavi. There''s something about early morning ragas — they feel like they belong to a different time of day entirely. #carnatic #raaga #morningpractice','{"#carnatic","#raaga","#morningpractice"}','pro',true,'singer','public',4,19,3,'2025-03-28 07:30:00+00'),
  ('11111111-0000-0000-0000-000000000002','text','Collaborated with a jazz pianist last week on a fusion piece. Mapping Carnatic microtones onto Western harmony is still one of the most interesting puzzles I''ve come across.','{"#fusion","#vocals","#jazz"}','pro',true,'singer','public',2,14,5,'2025-03-25 16:00:00+00'),
  ('11111111-0000-0000-0000-000000000002','text','Heading to Chennai next month for a music festival. Excited to perform and even more excited to listen.','{}','general',false,null,'public',0,27,3,'2025-03-24 10:10:00+00');

-- Music
INSERT INTO public.posts (user_id, content_type, caption, tags, post_type, is_pro_post, persona_discipline, visibility, pro_upvote_count, like_count, comment_count, created_at) VALUES
  ('11111111-0000-0000-0000-000000000003','text','Finished the string arrangement for my ambient EP today. Four layers of cello, each tuned a quarter tone apart. It creates a shimmer that no plugin has ever given me. #composition #ambient #strings','{"#composition","#ambient","#strings"}','pro',true,'musician','public',6,28,6,'2025-03-28 11:00:00+00'),
  ('11111111-0000-0000-0000-000000000003','text','On the creative process: I find I write best when I''m not trying to write. The ideas that stick always arrive while I''m doing something else.','{"#process","#music","#creativity"}','pro',true,'musician','public',4,22,4,'2025-03-26 13:30:00+00'),
  ('11111111-0000-0000-0000-000000000003','text','My first album is now 5 years old. Went back and listened today. I''d do almost everything differently — which means I grew. Good.','{}','general',false,null,'public',0,41,9,'2025-03-23 20:00:00+00');

-- Visual Arts
INSERT INTO public.posts (user_id, content_type, caption, tags, post_type, is_pro_post, persona_discipline, visibility, pro_upvote_count, like_count, comment_count, created_at) VALUES
  ('11111111-0000-0000-0000-000000000004','text','Working on a new canvas — 120×180cm, oil on linen. The subject is a demolition site near my studio. There''s something beautiful about things being taken apart. #oilpainting #contemporaryart #process','{"#oilpainting","#contemporaryart","#process"}','pro',true,'visual-artist','public',9,52,11,'2025-03-28 10:00:00+00'),
  ('11111111-0000-0000-0000-000000000004','text','Mixed media experiment: encaustic wax over acrylic + collage elements from old architectural blueprints. The translucency of the wax changes everything. #mixedmedia #encaustic','{"#mixedmedia","#encaustic"}','pro',true,'visual-artist','public',7,38,8,'2025-03-27 09:00:00+00'),
  ('11111111-0000-0000-0000-000000000004','text','Visited the Biennale earlier this year. Some of the work there changed what I think is possible. Still processing.','{}','general',false,null,'public',0,44,12,'2025-03-22 15:00:00+00');

-- Film & Video
INSERT INTO public.posts (user_id, content_type, caption, tags, post_type, is_pro_post, persona_discipline, visibility, pro_upvote_count, like_count, comment_count, created_at) VALUES
  ('11111111-0000-0000-0000-000000000005','text','Day 14 of shooting the urban greens documentary. Today we filmed a community garden being tended by three generations of the same family. Nobody directed them — they just did what they always do. That''s the whole film right there. #documentary #filmmaking','{"#documentary","#filmmaking"}','pro',true,'filmmaker','public',5,29,7,'2025-03-28 17:00:00+00'),
  ('11111111-0000-0000-0000-000000000005','text','On gear: I''ve shot features on iPhones and on Alexas. The camera matters far less than what you point it at and why. #cinematography #lowbudget','{"#cinematography","#lowbudget"}','pro',true,'filmmaker','public',3,18,5,'2025-03-26 12:00:00+00');

-- Poetry & Writing
INSERT INTO public.posts (user_id, content_type, caption, tags, post_type, is_pro_post, persona_discipline, visibility, pro_upvote_count, like_count, comment_count, created_at) VALUES
  ('11111111-0000-0000-0000-000000000006','poem','— from "The Weight of Ordinary Things" (work in progress)','{"#poetry","#writing"}','pro',true,'poet','public',4,21,3,'2025-03-28 08:00:00+00'),
  ('11111111-0000-0000-0000-000000000006','text','The best revision advice I ever received: "Read it out loud. Your mouth knows before your brain does." Works every single time. #writing #poetry #craft','{"#writing","#poetry","#craft"}','pro',true,'poet','public',3,16,4,'2025-03-26 09:30:00+00'),
  ('11111111-0000-0000-0000-000000000006','text','Rainy day. Blanket. Second coffee. New notebook. This is what writing conditions look like.','{}','general',false,null,'public',0,33,6,'2025-03-25 11:00:00+00');

-- Technology
INSERT INTO public.posts (user_id, content_type, caption, tags, post_type, is_pro_post, persona_discipline, visibility, pro_upvote_count, like_count, comment_count, created_at) VALUES
  ('11111111-0000-0000-0000-000000000007','text','Shipped a new feature today: real-time collaboration on shared creative briefs. Turns out the hard part isn''t the websockets — it''s the conflict resolution. Always is. #buildinpublic #webdev #react','{"#buildinpublic","#webdev","#react"}','pro',true,'technology','public',5,24,6,'2025-03-28 16:00:00+00'),
  ('11111111-0000-0000-0000-000000000007','text','Unpopular opinion: most SaaS products are 80% CRUD with a good landing page. The 20% that isn''t CRUD is usually what makes or breaks the product. #startups #saas #tech','{"#startups","#saas","#tech"}','pro',true,'technology','public',4,31,9,'2025-03-27 10:00:00+00'),
  ('11111111-0000-0000-0000-000000000007','text','Three months since going indie. Revenue is still scary. Focus is better than it''s ever been. Net positive.','{}','general',false,null,'public',0,28,5,'2025-03-25 19:00:00+00');

-- Fitness & Sports
INSERT INTO public.posts (user_id, content_type, caption, tags, post_type, is_pro_post, persona_discipline, visibility, pro_upvote_count, like_count, comment_count, created_at) VALUES
  ('11111111-0000-0000-0000-000000000008','text','Programming note: you don''t need to train more, you need to train better. Most people are under-recovering, not under-training. Sleep, nutrition, stress — these are your actual limiters. #fitness #recovery #coaching','{"#fitness","#recovery","#coaching"}','pro',true,'fitness','public',6,35,8,'2025-03-28 06:30:00+00'),
  ('11111111-0000-0000-0000-000000000008','text','Client hit a 5-year strength goal today. She''s been working toward this since before the pandemic. Some things take time and that''s fine. Consistency > intensity. #personaltraining #strengthcoach','{"#personaltraining","#strengthcoach"}','pro',true,'fitness','public',4,27,5,'2025-03-27 15:00:00+00'),
  ('11111111-0000-0000-0000-000000000008','text','Morning run. 6km. Cold. Worth it. Highly recommend.','{}','general',false,null,'public',0,38,4,'2025-03-26 07:00:00+00');

-- Culinary Arts
INSERT INTO public.posts (user_id, content_type, caption, tags, post_type, is_pro_post, persona_discipline, visibility, pro_upvote_count, like_count, comment_count, created_at) VALUES
  ('11111111-0000-0000-0000-000000000009','text','Today''s special: saffron-braised lamb with pomegranate and pistachio gremolata. The trick is blooming the saffron in warm water 30 minutes before using — the colour and aroma are incomparable. #cooking #recipe #finedining','{"#cooking","#recipe","#finedining"}','pro',true,'culinary','public',5,30,7,'2025-03-28 12:00:00+00'),
  ('11111111-0000-0000-0000-000000000009','text','Food styling philosophy: the plate should look like it arrived there naturally. Every element needs a reason to be where it is. Forced arrangement is immediately visible. #foodstyling #plating','{"#foodstyling","#plating"}','pro',true,'culinary','public',3,22,4,'2025-03-26 11:00:00+00');

-- Dance
INSERT INTO public.posts (user_id, content_type, caption, tags, post_type, is_pro_post, persona_discipline, visibility, pro_upvote_count, like_count, comment_count, created_at) VALUES
  ('11111111-0000-0000-0000-000000000010','text','Rehearsal week for the new piece. The score is a single repeated phrase — 8 counts — that the ensemble performs out of phase with each other. The friction between bodies moving in almost-sync is the point. #contemporarydance #choreography','{"#contemporarydance","#choreography"}','pro',true,'dancer','public',4,20,3,'2025-03-28 14:00:00+00'),
  ('11111111-0000-0000-0000-000000000010','text','Teaching a workshop on improvisation tomorrow. I always start with one rule: the first thing you think of, don''t do it. See what comes after. #danceworkshop #improv #movement','{"#danceworkshop","#improv","#movement"}','pro',true,'dancer','public',3,17,2,'2025-03-27 16:00:00+00');

-- Step 5: Update post_count on profiles to match inserted posts
UPDATE public.profiles SET post_count = (
  SELECT COUNT(*) FROM public.posts WHERE posts.user_id = profiles.id
) WHERE id IN (
  '11111111-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000002',
  '11111111-0000-0000-0000-000000000003',
  '11111111-0000-0000-0000-000000000004',
  '11111111-0000-0000-0000-000000000005',
  '11111111-0000-0000-0000-000000000006',
  '11111111-0000-0000-0000-000000000007',
  '11111111-0000-0000-0000-000000000008',
  '11111111-0000-0000-0000-000000000009',
  '11111111-0000-0000-0000-000000000010'
);
