# Remote proxies

A remote proxy lets the IDM of one tenant (the **sending** tenant) make calls to the IDM of another tenant (the **receiving** tenant) as a user it is mapped to there. Once a proxy named `zion` works, any IDM REST call to `/openidm/external/idm/zion/…` on the sending tenant is made on the receiving tenant. This is what makes it possible to read or change data of one environment from another one without a second login.

The `frodo idm remote-proxy` commands manage the proxy configurations (`external.idm/<name>` in the IDM configuration of the sending tenant), and three of them build and check a whole proxy:

| Command | What it does |
| --- | --- |
| `list`, `describe` | Show the remote proxies of a tenant, or one of them. |
| `export`, `import` | Move proxy configurations to and from files. |
| `create`, `update`, `delete` | Manage a single proxy configuration by hand. |
| `setup` | Build a working proxy between two tenants in one command. |
| `test` | Make one call through a proxy and say what is wrong when it does not work. |
| `teardown` | Take a proxy down again, with everything `setup` created for it. |

All of them are for Identity Cloud tenants.

## Set up a proxy between two tenants

You need a saved connection profile for both tenants, for example with `frodo conn save`. Say the sending tenant is `matrix` and the receiving tenant `zion`:

```console
$ frodo idm remote-proxy setup --target https://openam-zion.id.forgerock.io/am --dry-run https://openam-matrix.id.forgerock.io/am
$ frodo idm remote-proxy setup --target https://openam-zion.id.forgerock.io/am https://openam-matrix.id.forgerock.io/am
```

The first command only shows the plan. The second asks for confirmation, because the proxy gets the rights of the IDM administrator on the receiving tenant, and because applying ESV changes restarts services on the sending tenant. Add `-y` to skip the question; without a terminal `-y` or `--dry-run` is required.

`setup` creates:

| Tenant | What | Name (for the proxy `zion`) |
| --- | --- | --- |
| zion (receiving) | OAuth2 client, client credentials, scope `fr:idm:*`, with a generated secret | `frodo-remote-proxy-matrix` |
| zion (receiving) | Static user mapping that lets that client act as the IDM administrator | the client id |
| matrix (sending) | ESV secret that holds the client secret | `esv-remote-proxy-zion` |
| matrix (sending) | ESV variable that holds the host name of the receiving tenant | `esv-remote-proxy-zion-host` |
| matrix (sending) | The remote proxy configuration | `zion` |

It then applies the ESV changes, which takes about three minutes and up to ten, and tests the proxy until it answers. The generated secret is held in memory only and is never printed or logged.

The proxy is named after the receiving tenant by default. Choose another name with `-i`, and another client with `--client-id`. `--no-apply` leaves the ESV changes unapplied (apply them with `frodo esv apply`, then run `test`), and `--no-wait` starts the apply without waiting for it.

Run `setup` again at any time: it completes what is missing and changes nothing that exists. `--rotate-secret` writes a new secret to the client and the ESV secret; the proxy fails until the ESV changes are applied.

## Why the URLs are placeholders

A promotion carries IDM configuration from one environment to the next, so it carries a remote proxy. A proxy that names its receiving tenant in a URL would point the next environment at the same receiver. `setup` therefore writes the host as an ESV placeholder (`https://&{esv.remote.proxy.zion.host}/openidm/`), and the secret as one too. Set the ESV variable and the ESV secret in each environment, and each one reaches its own receiver. `frodo config-manager pull remote-proxies` warns about a proxy that still names a host in a URL.

## Check a proxy

```console
$ frodo idm remote-proxy test -i zion matrix
```

A working proxy shows the identity and roles it is mapped to on the receiving tenant. A proxy that does not work is explained: it is not loaded because the ESV changes it needs were not applied yet (a new proxy also takes up to half a minute to load), it is disabled, the token request failed, the OAuth2 client has no static user mapping, or the receiving tenant does not answer.

## Take a proxy down

```console
$ frodo idm remote-proxy teardown -i zion --dry-run matrix
$ frodo idm remote-proxy teardown -i zion matrix
```

`teardown` cuts the access first: it deletes the static user mapping on the receiving tenant, which stops the proxy at once, then the OAuth2 client (deleting only the client would leave a proxy that already holds a token working until the token expires, which can be up to an hour). Then it deletes the remote proxy, the ESV variable and the ESV secret on the sending tenant. IDM refuses to delete the variable for about a minute after the proxy is gone, so that delete is retried. No ESV apply is needed afterwards. It finds the receiving tenant from the host name in the ESV variable, or you give `--target`. `--keep-client` leaves the receiving tenant alone (and so leaves the access in place), and a client that another proxy still uses is kept. Run it again if it stops halfway: what is already gone is skipped.
