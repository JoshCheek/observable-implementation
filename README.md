Implementing the Observable API as a learning experience.

Install dependencies:

```sh
npm install
```

Run tests:

```sh
node index.js | less -R
```

[Fish](https://fishshell.com/) function I used for iterating through the failing tests:

```fish
function r
    if node index.js
        fg
    end | ruby -00ne 'print if /\e\[31m/; END { print }'
end
```
