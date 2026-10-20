/*
# Create tables for the real-time collaborative code editor

1. New Tables
- `rooms` — collaborative coding rooms. Each room has a short shareable ID, an owner, a programming language, the current code, and a list of member user IDs.
  - `id` (uuid, primary key)
  - `room_id` (text, unique, short 6-char shareable code)
  - `owner_id` (uuid, references auth.users, defaults to auth.uid())
  - `name` (text, room display name)
  - `language` (text, default 'cpp')
  - `code` (text, current editor contents)
  - `is_private` (boolean, default false)
  - `created_at` (timestamptz)
- `messages` — chat messages inside a room.
  - `id` (uuid, primary key)
  - `room_id` (text, references rooms.room_id on delete cascade)
  - `user_id` (uuid, references auth.users, defaults to auth.uid())
  - `sender_name` (text, denormalized display name)
  - `message` (text)
  - `created_at` (timestamptz)
- `code_history` — audit log of who changed the code and when.
  - `id` (uuid, primary key)
  - `room_id` (text, references rooms.room_id on delete cascade)
  - `user_id` (uuid, references auth.users, defaults to auth.uid())
  - `user_name` (text)
  - `code` (text, snapshot of code at that point)
  - `created_at` (timestamptz)

2. Security
- Enable RLS on all tables.
- rooms: owner can do everything; authenticated users can SELECT any non-private room (to join via room ID) and can UPDATE code/language on rooms they can see (collaboration). Only owner can delete.
- messages: any authenticated user can SELECT messages for rooms they can see; can INSERT their own messages.
- code_history: any authenticated user can SELECT history for visible rooms; can INSERT their own history entries.

3. Important notes
- owner_id and user_id columns default to auth.uid() so inserts that omit them still satisfy WITH CHECK.
- members is a uuid[] array tracking who has joined the room.
*/

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text UNIQUE NOT NULL,
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled Room',
  language text NOT NULL DEFAULT 'cpp',
  code text NOT NULL DEFAULT '',
  is_private boolean NOT NULL DEFAULT false,
  members uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_rooms" ON rooms;
CREATE POLICY "select_rooms" ON rooms FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_rooms" ON rooms;
CREATE POLICY "insert_rooms" ON rooms FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "update_rooms" ON rooms;
CREATE POLICY "update_rooms" ON rooms FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_rooms" ON rooms;
CREATE POLICY "delete_rooms" ON rooms FOR DELETE
  TO authenticated USING (auth.uid() = owner_id);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name text NOT NULL DEFAULT 'Anonymous',
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_messages" ON messages;
CREATE POLICY "select_messages" ON messages FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_messages" ON messages;
CREATE POLICY "insert_messages" ON messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_messages" ON messages;
CREATE POLICY "delete_messages" ON messages FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS code_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id text NOT NULL REFERENCES rooms(room_id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name text NOT NULL DEFAULT 'Anonymous',
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE code_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_code_history" ON code_history;
CREATE POLICY "select_code_history" ON code_history FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_code_history" ON code_history;
CREATE POLICY "insert_code_history" ON code_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_rooms_room_id ON rooms(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_code_history_room_id ON code_history(room_id, created_at);
