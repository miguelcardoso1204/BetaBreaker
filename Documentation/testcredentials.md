# Test Credentials

All seed users are created by `supabase/seed.sql` during `supabase db reset`.

## Users

| Email              | Password      | Display Name   | Role at Summit     |
|--------------------|---------------|----------------|--------------------|
| climber@seed.test  | password123   | Alex Climber   | Climber            |
| setter@seed.test   | password123   | Sam Setter     | Setter             |
| admin@seed.test    | password123   | Jordan Admin   | Gym Admin          |

## Who has what data?

### Alex Climber (recommended for testing)
- Home gym: Summit Climbing Gym
- 15 ascents across 3 gyms (Summit, Vertical World, The Circuit)
- 4-week climbing streak
- 5 favorited routes, 1 project, 1 wishlist
- 12+ badges (grade + volume + streak)
- Follows Sam and Jordan
- 1 maintenance ticket filed

### Sam Setter
- 2 ascents at Summit
- 4 route feedback (beta tips) authored
- Followed by Alex and Jordan

### Jordan Admin
- No ascents
- 1 route feedback authored
- Follows Alex and Sam
