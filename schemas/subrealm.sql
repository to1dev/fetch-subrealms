DROP TABLE IF EXISTS _subrealms;

CREATE TABLE IF NOT EXISTS _subrealms (
    RealmName TEXT PRIMARY KEY NOT NULL,
    RealmId TEXT NOT NULL UNIQUE,
    RealmNumber INTEGER NOT NULL UNIQUE,
    RealmParent TEXT NOT NULL,
    RealmMinter TEXT NOT NULL,
    RealmOwner TEXT NOT NULL,
    ProfileId TEXT
);
