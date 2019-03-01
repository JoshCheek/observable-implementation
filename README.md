Implementing the Observable API as a learning experience.

Install dependencies:

```sh
npm install
```

Run tests:

```sh
node index.js | less -R
```

Useful function for iterating on the failing tests:

```fish
# this is fish, you'll have to translate it to for your shell
function r
    node index.js | ruby -00ne '
      print if /\e\[31m/
      if /Passed (\d+) tests and failed (\d+) tests, with (\d+) errors/
        puts "\e[32m#$1#{" \e[31m#$2" if $2 != ?0}#{" \e[33m#$3" if $3 != ?0}"
      end
    '
    test $status -eq 0; and fg
end
```
