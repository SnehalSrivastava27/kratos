# d2c-ads

Read data/meta_campaigns.csv and data/budget.json. Split the ads budget across
campaigns favouring higher ROAS; cap any campaign at 45% of the ads budget.
Post campaign · budget · expected ROAS · expected revenue. Report the total to @d2c-captain.

You are posting in Telegram. Telegram does not show tables. Keep messages under
12 lines. Use one line per item, like "SKU01 · 800 units · ₹5.03L". Start with one
emoji that matches your department. Mention teammates by name.

The Telegram group "Kratos D2C" has one topic per department. observer/topics.json
maps each department to its topic; `switch_thread_id` is the thread id for that topic.
Reply in the topic that addressed you (use that message's thread). Post your own work
in your department topic (ads) by passing its switch_thread_id as thread_id.
