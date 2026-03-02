import json
import tempfile
import shutil
from unittest import TestCase
from pathlib  import Path

# Import the generator functions directly
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / 'scripts'))
from generate_vault_i18n_pages import translate_html, load_json, find_html_files


class test__generate_vault_i18n_pages(TestCase):

    def test__translate_html__sets_lang_attribute(self):
        html   = '<html lang="en-GB"><head></head><body></body></html>'
        result = translate_html(html, {}, {}, {'lang': 'de-DE', 'slug': 'de-de'})
        assert 'lang="de-DE"' in result

    def test__translate_html__adds_prerendered_marker(self):
        html   = '<html lang="en-GB"><head></head><body></body></html>'
        result = translate_html(html, {}, {}, {'lang': 'fr-FR', 'slug': 'fr-fr'})
        assert 'i18n-prerendered' in result

    def test__translate_html__translates_data_i18n(self):
        html   = '<html lang="en-GB"><head></head><body><p data-i18n="vault.entry.open">Open Vault</p></body></html>'
        translations = {'vault.entry.open': 'Tresor öffnen'}
        result = translate_html(html, translations, {'vault.entry.open': 'Open Vault'}, {'lang': 'de-DE', 'slug': 'de-de'})
        assert 'Tresor öffnen' in result
        assert 'Open Vault' not in result

    def test__translate_html__falls_back_to_english(self):
        html   = '<html lang="en-GB"><head></head><body><p data-i18n="vault.entry.open">Open Vault</p></body></html>'
        result = translate_html(html, {}, {'vault.entry.open': 'Open Vault'}, {'lang': 'de-DE', 'slug': 'de-de'})
        assert 'Open Vault' in result

    def test__translate_html__translates_placeholder(self):
        html   = '<html lang="en-GB"><head></head><body><input data-i18n-placeholder="vault.entry.placeholder" placeholder="Paste your vault key here"></body></html>'
        translations = {'vault.entry.placeholder': 'Tresorschlüssel einfügen'}
        result = translate_html(html, translations, {}, {'lang': 'de-DE', 'slug': 'de-de'})
        assert 'Tresorschlüssel einfügen' in result

    def test__load_json__strips_comment_keys(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump({'_comment': 'test', 'vault.entry.open': 'Open'}, f)
            f.flush()
            data = load_json(Path(f.name))
        assert '_comment' not in data
        assert 'vault.entry.open' in data

    def test__load_json__returns_empty_for_missing_file(self):
        data = load_json(Path('/nonexistent/file.json'))
        assert data == {}

    def test__find_html_files__finds_index(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            p = Path(tmpdir) / 'index.html'
            p.write_text('<html></html>')
            files = find_html_files(Path(tmpdir))
            assert len(files) == 1
            assert str(files[0]) == 'index.html'

    def test__full_generation_roundtrip(self):
        """Test the full generation flow with a temp directory structure."""
        with tempfile.TemporaryDirectory() as tmpdir:
            base = Path(tmpdir)

            # Create en-gb source
            en_dir = base / 'en-gb'
            en_dir.mkdir()
            (en_dir / 'index.html').write_text(
                '<html lang="en-GB"><head></head><body>'
                '<h1 data-i18n="app.title">SG/Vault</h1>'
                '<p data-i18n="vault.entry.open">Open Vault</p>'
                '</body></html>'
            )

            # Create i18n directory with a translation
            i18n_dir = base / 'i18n'
            i18n_dir.mkdir()
            (i18n_dir / 'en-gb.json').write_text(json.dumps({
                'app.title': 'SG/Vault',
                'vault.entry.open': 'Open Vault'
            }))
            (i18n_dir / 'de-de.json').write_text(json.dumps({
                'app.title': 'SG/Tresor',
                'vault.entry.open': 'Tresor öffnen'
            }))

            # Run generation
            locale_info  = {'slug': 'de-de', 'json': 'de-de.json', 'lang': 'de-DE'}
            en_trans     = load_json(i18n_dir / 'en-gb.json')
            de_trans     = load_json(i18n_dir / 'de-de.json')
            html_files   = find_html_files(en_dir)

            de_dir = base / 'de-de'
            de_dir.mkdir()

            for rel_path in html_files:
                html       = (en_dir / rel_path).read_text()
                translated = translate_html(html, de_trans, en_trans, locale_info)
                (de_dir / rel_path).write_text(translated)

            # Verify
            result = (de_dir / 'index.html').read_text()
            assert 'lang="de-DE"'      in result
            assert 'SG/Tresor'          in result
            assert 'Tresor öffnen'      in result
            assert 'i18n-prerendered'   in result
            assert 'SG/Vault'           not in result
            assert 'Open Vault'         not in result


class test__deploy_workflow_exists(TestCase):

    def test__workflow_file_exists(self):
        workflow = Path(__file__).parent.parent.parent.parent / '.github/workflows/deploy-ui-vault.yml'
        assert workflow.exists()

    def test__workflow_references_vault_paths(self):
        workflow = Path(__file__).parent.parent.parent.parent / '.github/workflows/deploy-ui-vault.yml'
        content  = workflow.read_text()
        assert 'sgraph_ai_app_send__ui__vault' in content
        assert 'sgraph-vault'                   in content
        assert 'generate_vault_i18n_pages.py'   in content
        assert 'deploy_static_site.py'          in content

    def test__workflow_has_dev_and_production(self):
        workflow = Path(__file__).parent.parent.parent.parent / '.github/workflows/deploy-ui-vault.yml'
        content  = workflow.read_text()
        assert 'dev'        in content
        assert 'production' in content

    def test__generator_script_exists(self):
        script = Path(__file__).parent.parent.parent.parent / 'scripts/generate_vault_i18n_pages.py'
        assert script.exists()
