---
status: accepted
date: 2026-11-26
decision-makers:
  - maintainers
applies-to:
  - src/utils/FileSetPathUtils.ts
  - src/utils/ConfigTreePath.ts
repos:
  - rockcarver/frodo-cli
  - rockcarver/frodo-lib
issues:
  - rockcarver/frodo-cli#1365
  - rockcarver/frodo-lib#1114
---

# A name that does not fit in a file name is shortened and ends with a checksum

## Context and problem statement

A pull names the file of an object after its id, and a file name holds 255 bytes with its extension. The servers accept ids of thousands of characters, and some ids are not text (a lone surrogate). When this was decided, on 2026-11-26, such an id was cut silently, so two ids that start alike shared one name and the later object was not pulled, or it was refused, or it failed a whole file set at the gate. A name has to be a pure function of the id, so that a pull twice gives the same tree and a diff in version control stays small. [Core 0028](0028-the-library-turns-configuration-into-file-sets-through-the-types-own-read-and-write.md) keeps the files of a pull as they were except in three cases, and a difference outside them needs a record, so the rule for a long name is decided once.

## Decision

- **An id keeps exactly the name it had when that was a valid file name with its suffix.** The id is text (no lone surrogate, no U+007F), the sanitizer cuts nothing of it, and the name with the longest suffix that the type puts after it (`.json` when it names none) is at most 255 bytes. "The encoded name" is what `safeFileName` in `src/utils/FileSetPathUtils.ts` gives, the output of the `sanitize-filename` package: `/ ? < > \ : | "` and the control characters of C0 and C1 are written as `%XX`, `*` and the dots at the very end are taken out (a space at the end is written `%20` and stays), a name of only dots or a device name of Windows (`con`, `nul.x`) is made empty, and the name is cut at 255 bytes. A device name with a superscript digit (`com¹.x`) is written out whole as `%XX`. "Cuts nothing" is measured on the encoded name before `*` and the dots at the end are taken out, a space at the end counting as `%20`: 255 bytes at most. So `'x'` 250 times and `*` keeps its name, `'x'` 250 times, while `'x'` 249 times and a space does not fit: the name is 252 bytes, the file 257.
- **Any other id gets a shortened name:** the start of the encoded name, `~` and a checksum. The start is cut at a whole character to `255 - suffix - 9` bytes, then a partial escape comes off in two steps, each once, also for text of the id that only looks like an escape (upper and lower case are the same). Step one: a trailing `%` with one hexadecimal digit or none (`...%2` becomes `...`, and of `...%%` one `%` goes). Step two: a trailing escaped character that is not whole. A lead escape from `%C0` to `%DF` needs one continuation escape after it (`%80` to `%BF`), one from `%E0` to `%EF` needs two, one from `%F0` to `%F7` needs three; a trailing lead with fewer than it needs comes off with the ones it has (`...%C3`, `...%E2%82` and `...%F0%9F%98` become `...`), and a lead with all of them stays (`...%C3%A9`, `...%E2%82%AC`). `%F8` and above, and a continuation escape without its lead, are not leads and stay (`...%F8`, `...%A9`).
- **An id that leaves no name has none.** When the sanitizer empties the encoded name (a name of only dots or `*`, a device name such as `con.x`, `con.` and a lone surrogate, or `'*'` 300 times and `abc`, whose first 255 bytes are stars), `fileNameOf` gives an empty name and `encodedName` refuses the id, whatever its length. `nameInFolder` and `nameInStem` do the same for an id that is not one safe name, and keep one that is as typed (see the next point).
- **A name typed in a folder is cut as typed.** For an id that is one safe name, `nameInFolder` and `nameInStem` cut the text as it is, not its encoded form: `a?<b` and 300 `x` gives `a?<b`, 237 `x`, `~` and the checksum, where `fileNameOf` and `encodedName` start with `a%3F%3Cb`. The checksum is the same.
- **The checksum** is the first 8 lowercase hexadecimal characters of the SHA-256 of the complete id as UTF-16 little-endian code units. `'a'` 300 times gives `e8722168` (big-endian would give `2da9cfb6`), so its name is `'a'` 241 times and `~e8722168`.
- **An id that is not text** (a lone surrogate, or U+007F, which the gate takes for a control character and the sanitizer leaves) has U+FFFD in its name and the checksum of the id as it is: `a` U+007F `b` is `a` U+FFFD `b~c459de40`.
- **One name for one object.** The type makes the name of an object once, with the longest suffix that it uses, and gives it to every file of the object. A name is never made from a shortened name.
- **A push never reads a file name.** The id of an object is the id that its file holds.
- **A clash is reported, never settled by renaming.** Two ids share a name when they share the start and the 8 characters (about one pair in four billion that shares a start), and when an id is written like a shortened name: `'a'` 241 times and `~e8722168` fits, so it keeps its name, which is the name of `'a'` 300 times. Ids that the sanitizer makes alike (`a*b` and `ab`, `a.` and `a`) share a name as they always did. The consumer keeps the first, reports the later as a collision and writes nothing for it, so a name never depends on the other ids.
- **The format is permanent.** The separator, the byte order, the length and the hash of the checksum, the cut and the guard do not change under this record. A change is a new record that supersedes this one and moves every shortened name that was written. A second pull request gives the command line the same rule, and the tests of both pin the format with a table made by an independent implementation (Python, `hashlib`).

## Consequences

- A long id no longer gets the name of another id that starts like it, and an id that is not text gets a file like any other. A clash is still possible, rarely, and the consumer says so.
- An id whose name was cut silently, was too long with its suffix or was refused by the gate gets its shortened name at the next pull, and a file that an older pull wrote under another name is left to the consumer to remove. An id with a valid name keeps it.
- A name is no longer the id, so a consumer that wants an id reads it from the file.
- Not covered: the folders of realms, the names that Windows reserves for a name typed in a folder, and the length of a whole path.

## Alternatives considered

- **A longer checksum.** Fewer clashes, longer names; 8 characters is enough because a clash is reported and no file is lost.
- **Renaming on a clash.** Rejected: a name would depend on the other ids, and a pull twice could differ.
- **Refusing a name that is too long.** Rejected: the object is not pulled, and the pull says so only for that object.
