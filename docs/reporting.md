# Self-contained HTML asset reports

Assetloom can turn each effective merged configuration into a portable visual
review. The report is a single HTML file with inline styles, behavior, source
artwork, and generated output bytes. It does not load fonts, scripts, images,
or other resources from the network or filesystem.

## Create a report while generating

Set the customer identity in the final brand configuration:

```json
{
  "metadata": {
    "name": "Acme Banking",
    "description": "Production native artwork for Acme."
  }
}
```

Then generate the native files and report from the same merged configuration:

```sh
assetloom generate \
  -c config/base.assetloom.json \
  -c config/brands/acme.assetloom.json \
  --report
```

The default output is:

```text
.assetloom/reports/acme-banking.html
```

Use a reviewed or CI-artifact directory instead:

```sh
assetloom generate \
  -c config/base.assetloom.json \
  -c config/brands/acme.assetloom.json \
  --report-output reports/acme.html
```

`--report-output` implies `--report`. The output must remain inside
`project.root`.

## Inspect existing generated files

The standalone command does not generate or repair native resources. It reads
the current task plan, manifest, source inputs, and files on disk:

```sh
assetloom report \
  -c config/base.assetloom.json \
  -c config/brands/acme.assetloom.json
```

Missing, modified, or untracked outputs remain visible in the report and are
marked prominently. Use `assetloom verify` after each configuration when CI
must fail on an integrity or native-resource problem.

## Review many customer configurations

Run generation separately for every final merge chain. Because the customer
name becomes the report filename, reports do not overwrite one another:

```sh
assetloom generate -c config/base.assetloom.json -c config/brands/acme.assetloom.json --report
assetloom verify   -c config/base.assetloom.json -c config/brands/acme.assetloom.json

assetloom generate -c config/base.assetloom.json -c config/brands/contoso.assetloom.json --report
assetloom verify   -c config/base.assetloom.json -c config/brands/contoso.assetloom.json
```

Each report embeds the bytes present immediately after its configuration was
generated. It remains an independent snapshot even when the next customer
configuration reuses the same native project paths.

In CI, archive `.assetloom/reports/*.html` after all customer configurations
have run. Reports inside `.assetloom/` are local generated state; the consuming
repository decides whether to ignore them. AssetLoom never edits ignore files.
A custom `reports/` destination can be committed if the project wants reviewed
snapshots in source control.

## What the dashboard contains

- effective configuration name, description, merge order, and fingerprint;
- platform filtering for Android and iOS;
- configured source-artwork previews and content hashes;
- platform-context previews for launcher, adaptive, monochrome, notification,
  Light/Dark/Tinted, and splash appearances;
- representative appearance previews and compact groups instead of repeated
  cards for every native density;
- a complete collapsible generated-file tree with click-to-preview inspection
  in a persistent two-pane browser for every image, structured resource, and
  generated native bundle file;
- dimensions, byte size, task, operation, path, ownership, and hashes;
- manifest comparisons that flag missing, modified, or untracked outputs;
- caller-safe native usage guidance;
- the complete effective merged configuration.

Resource presentation is modular. App icons, notification icons, and splash
screens have separate templates that are composed into the global report
document, so a resource presentation can evolve without rewriting the
dashboard shell.

The notification appearance preview follows the official
[Android notification anatomy](https://developer.android.com/design/ui/mobile/guides/home-screen/notifications):
it uses the standard collapsed system template with the generated small icon,
app name, timestamp, title, supporting text, and expand affordance. Android
System UI owns the final presentation, so colors and spacing can vary by OS
release, device manufacturer, and user theme.

Reports intentionally contain no generation timestamp. Given the same
configuration, source bytes, generated files, and manifest, a second report
run is byte-identical and performs no write.
