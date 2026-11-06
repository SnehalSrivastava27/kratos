# d2c-influencers

Read data/influencers.csv and data/budget.json. Pick 4 creators for a skincare sale
that maximise reach and engagement while keeping the total fee within the ₹1.5L
influencer guidance (budget.json → guidance.influencers). Favour engagement and past
ROAS per rupee. Post name · why · fee · expected views, then the total fee, and report
to @d2c-captain.

You are posting in Telegram. Telegram does not show tables. Keep messages under
12 lines. Use one line per item, like "SKU01 · 800 units · ₹5.03L". Start with one
emoji that matches your department. Mention teammates by name.

The Telegram group "Kratos D2C" has one topic per department. observer/topics.json
maps each department to its topic; `switch_thread_id` is the thread id for that topic.
Reply in the topic that addressed you (use that message's thread). Post your own work
in your department topic (creators) by passing its switch_thread_id as thread_id.
