//! Drawing of every screen. Layout follows the approved mockup: the brand mark centred over the
//! product name, an action bar at the bottom, and the mark filling up as the files are written.

use crate::anim::{self, ease_out, ease_out_back};
use crate::gfx::{Align, Gfx, Rect, Style};
use crate::icons;
use crate::progress::Phase;
use crate::strings::{self, Text, fill, tr};
use crate::theme::{self, Color};
use crate::ui::{Id, Mode, Screen, Ui};
use crate::widgets::{self, Kind};

const W: f32 = theme::MAIN_SIZE.0;
const H: f32 = theme::MAIN_SIZE.1;
const BAR_Y: f32 = H - theme::BAR_HEIGHT;
const HERO: Rect = Rect::new(274.0, 58.0, 92.0, 92.0);
const SMALL_HERO: Rect = Rect::new(288.0, 50.0, 64.0, 64.0);
/// The uninstall screens after the question have less to show; they sit lower to stay centred.
const UNINSTALL_PROGRESS_SHIFT: f32 = 52.0;
const REMOVED_SHIFT: f32 = 34.0;
const TITLE_Y: f32 = 168.0;
const BUTTON_H: f32 = 38.0;
const BUTTON_Y: f32 = BAR_Y + 15.0;
const MIN_BUTTON: f32 = 132.0;
const BODY: Style = Style::text(13.0).align(Align::Center).wrapped(20.0);

pub fn paint(g: &mut Gfx, ui: &mut Ui) {
    ui.begin_frame();
    if ui.mode == Mode::Update {
        paint_compact(g, ui);
        return;
    }
    background(g, W, H, (W / 2.0, 0.0));
    let title = match ui.mode {
        Mode::Uninstall => Text::CaptionUninstall,
        _ => Text::CaptionInstall,
    };
    widgets::caption(g, ui, W, title, ui.modal());
    let hero_shared = shares_hero(ui.previous) && shares_hero(ui.screen);
    if hero_shared {
        hero(g, ui);
    }
    let fade = ui.fade.value();
    let layered = fade < 0.999 && g.push_opacity(fade);
    g.translate(0.0, 6.0 * (1.0 - ease_out(fade)));
    if !hero_shared {
        hero(g, ui);
    }
    match ui.screen {
        Screen::Welcome => welcome(g, ui),
        Screen::Options => options(g, ui),
        Screen::Progress => progress(g, ui),
        Screen::Done => done(g, ui),
        Screen::Error => error(g, ui),
        Screen::Confirm => confirm(g, ui),
        Screen::Removed => removed(g, ui),
    }
    g.reset_transform();
    if layered {
        g.pop_layer();
    }
}

fn shares_hero(screen: Screen) -> bool {
    matches!(screen, Screen::Welcome | Screen::Progress | Screen::Done | Screen::Error)
}

fn background(g: &Gfx, width: f32, height: f32, glow_at: (f32, f32)) {
    g.clear(theme::BG);
    let bounds = Rect::new(0.0, 0.0, width, height);
    g.fill_radial(bounds, glow_at.0, glow_at.1, width * 0.7, height * 0.55, &[(0.0, theme::GLOW), (1.0, theme::GLOW.alpha(0.0))]);
}

fn glow(g: &Gfx, rect: Rect, strength: f32) {
    let (cx, cy) = rect.center();
    let radius = rect.w;
    let stops = [(0.0, theme::ACCENT.alpha(0.26 * strength)), (0.62, theme::ACCENT.alpha(0.0)), (1.0, theme::ACCENT.alpha(0.0))];
    g.fill_radial(Rect::new(cx - radius, cy - radius, radius * 2.0, radius * 2.0), cx, cy, radius, radius, &stops);
}

/// The mark as a gauge: a faint copy, with the filled part (from the bottom) in `color`.
fn meter(g: &mut Gfx, rect: Rect, amount: f32, color: Color) {
    g.mark(rect.x, rect.y, rect.w, theme::TEXT.alpha(0.16));
    let top = rect.y + rect.h * (1.0 - amount.clamp(0.0, 1.0));
    g.push_clip(Rect::new(rect.x - 1.0, top, rect.w + 2.0, rect.bottom() - top + 1.0));
    g.mark(rect.x, rect.y, rect.w, color);
    g.pop_clip();
}

fn hero(g: &mut Gfx, ui: &mut Ui) {
    let small = ui.mode == Mode::Uninstall || ui.screen == Screen::Options;
    if ui.screen == Screen::Options {
        return;
    }
    let rect = match (small, ui.screen) {
        (false, _) => HERO,
        (true, Screen::Progress) => SMALL_HERO.offset(0.0, UNINSTALL_PROGRESS_SHIFT),
        (true, Screen::Removed) => SMALL_HERO.offset(0.0, REMOVED_SHIFT),
        (true, _) => SMALL_HERO,
    };
    glow(g, rect, if ui.screen == Screen::Error { 0.4 } else { 1.0 });
    match (ui.mode, ui.screen) {
        (Mode::Uninstall, Screen::Progress) => meter(g, rect, 1.0 - ui.progress.tick(), Color::hex(0xC9D3E0)),
        (Mode::Uninstall, Screen::Removed) => removed_mark(g, ui, rect),
        (Mode::Uninstall, _) => g.mark(rect.x, rect.y, rect.w, Color::hex(0xC9D3E0)),
        (_, Screen::Welcome) => g.mark(rect.x, rect.y, rect.w, theme::MARK),
        (_, Screen::Progress) => meter(g, rect, ui.progress.tick(), theme::ACCENT),
        (_, Screen::Done) => full_mark(g, ui, rect),
        (_, _) => error_mark(g, rect),
    }
}

fn full_mark(g: &mut Gfx, ui: &Ui, rect: Rect) {
    g.mark(rect.x, rect.y, rect.w, theme::ACCENT);
    let t = (anim::elapsed(ui.entered) - 0.15) / 0.75;
    if !anim::reduced() {
        g.mark_shine(rect.x, rect.y, rect.w, t, 0.6);
    }
}

fn badge(g: &Gfx, rect: Rect, color: Color, glyph: char, ink: Color, pop: f32) {
    let radius = 15.0 * pop;
    let (cx, cy) = (rect.right() - 2.0, rect.bottom() - 4.0);
    g.fill_circle(cx, cy, radius + 4.0, theme::BG);
    g.fill_circle(cx, cy, radius, color);
    if pop > 0.5 {
        g.icon(glyph, 13.0 * pop, Rect::new(cx - 15.0, cy - 15.0, 30.0, 30.0), ink);
    }
}

fn error_mark(g: &mut Gfx, rect: Rect) {
    g.mark(rect.x, rect.y, rect.w, theme::TEXT.alpha(0.16));
    badge(g, rect, theme::WARNING, icons::WARNING, theme::ON_ACCENT, 1.0);
}

fn removed_mark(g: &mut Gfx, ui: &Ui, rect: Rect) {
    g.mark(rect.x, rect.y, rect.w, theme::TEXT.alpha(0.16));
    let pop = ease_out_back((anim::elapsed(ui.entered) - 0.1) / 0.35);
    badge(g, rect, theme::SUCCESS, icons::CHECK, Color::hex(0x0B2A1B), pop.max(0.0));
}

fn title(g: &Gfx, text: &str, y: f32, size: f32) {
    g.text(text, &Style::display(size).align(Align::Center), Rect::new(40.0, y, W - 80.0, size + 8.0), theme::TEXT);
}

/// Wrapped, centred body text; returns its height.
fn body(g: &Gfx, text: &str, y: f32, width: f32, color: Color) -> f32 {
    let rect = Rect::new((W - width) / 2.0, y, width, 200.0);
    let height = g.measure(text, &BODY, width).1;
    g.text(text, &BODY, rect, color);
    height
}

fn bar(g: &Gfx) {
    g.fill_rect(Rect::new(0.0, BAR_Y, W, theme::BAR_HEIGHT), Color::hexa(0x101D2D, 0.55));
}

/// Buttons laid out from the right edge of the bar, last argument rightmost.
fn bar_buttons(g: &mut Gfx, ui: &mut Ui, buttons: &[(Id, Kind, &str)]) {
    let mut right = W - 20.0;
    for (id, kind, label) in buttons.iter().rev() {
        let min = if matches!(kind, Kind::Primary | Kind::Danger) { MIN_BUTTON } else { 96.0 };
        let width = widgets::button_width(g, *kind, label, None, min);
        right -= width;
        widgets::button(g, ui, *id, Rect::new(right, BUTTON_Y, width, BUTTON_H), *kind, label, None);
        right -= 10.0;
    }
}

fn notice(g: &Gfx, text: &str, y: f32, color: Color, icon_color: Color) {
    let style = Style::text(12.0);
    let width = g.measure(text, &style, W - 120.0).0;
    let left = (W - width - 20.0) / 2.0;
    g.icon(icons::WARNING, 11.0, Rect::new(left, y, 14.0, 18.0), icon_color);
    g.text(text, &style, Rect::new(left + 20.0, y, width + 2.0, 18.0), color);
}

// ---- install -------------------------------------------------------------------------------------

fn welcome(g: &mut Gfx, ui: &mut Ui) {
    title(g, "Achievement Watcher", TITLE_Y, 27.0);
    widgets::next_tag(g, W / 2.0, TITLE_Y + 39.0);
    let tagline = match ui.config.old_version.as_str() {
        "" => tr(Text::Tagline).to_owned(),
        old if old == ui.config.version => tr(Text::TaglineReinstall).to_owned(),
        old => fill(Text::TaglineUpgrade, &[("old", old)]),
    };
    let height = body(g, &tagline, 232.0, 440.0, theme::MUTED);
    if ui.app_running {
        notice(g, tr(Text::AppRunning), 232.0 + height + 12.0, theme::WARNING_TEXT, theme::WARNING);
    }
    legal(g, ui);
    bar(g);
    let options = tr(Text::Options);
    let options_w = widgets::button_width(g, Kind::Link, options, Some(icons::GEAR), 0.0);
    widgets::button(g, ui, Id::Options, Rect::new(14.0, BUTTON_Y, options_w, BUTTON_H), Kind::Link, options, Some(icons::GEAR));
    let label = install_label(ui);
    let install_w = widgets::button_width(g, Kind::Primary, label, None, MIN_BUTTON);
    let meta_x = 14.0 + options_w + 10.0;
    meta(g, ui, Rect::new(meta_x, BUTTON_Y, W - 20.0 - install_w - 12.0 - meta_x, BUTTON_H));
    widgets::button(g, ui, Id::Install, Rect::new(W - 20.0 - install_w, BUTTON_Y, install_w, BUTTON_H), Kind::Primary, label, None);
}

fn install_label(ui: &Ui) -> &'static str {
    match ui.config.old_version.as_str() {
        "" => tr(Text::Install),
        old if old == ui.config.version => tr(Text::Reinstall),
        _ => tr(Text::Update),
    }
}

fn legal(g: &mut Gfx, ui: &mut Ui) {
    let link = tr(Text::LegalLink);
    let text = fill(Text::Legal, &[("link", link)]);
    let style = Style::text(11.5).align(Align::Center);
    let hover = ui.hover_amount(Id::License);
    let link_color = theme::TEXT.mix(theme::ACCENT_TEXT, hover);
    if let Some(bounds) = g.text_with_link(&text, link, &style, Rect::new(40.0, BAR_Y - 34.0, W - 80.0, 18.0), theme::MUTED, link_color) {
        ui.hit(Id::License, bounds);
    }
}

fn meta(g: &Gfx, ui: &Ui, rect: Rect) {
    // The size the installation ends up taking. The free-space check keeps the uncompressed one:
    // the files are written whole before they are compressed.
    let installed = if ui.config.installed_bytes > 0 { ui.config.installed_bytes } else { ui.config.required_bytes };
    let size = strings::size(installed);
    let line = fill(Text::VersionSize, &[("version", &ui.config.version), ("size", &size)]);
    let style = Style::text(11.5);
    g.text(&line, &style, Rect::new(rect.x, rect.y + 2.0, rect.w, 17.0), theme::MUTED);
    g.text(&compact_path(g, &ui.dir, &style, rect.w), &style, Rect::new(rect.x, rect.y + 19.0, rect.w, 17.0), theme::TEXT);
}

/// Shortens a path from the middle ("C:\Users\Victor\...\Achievement Watcher") until it fits.
fn compact_path(g: &Gfx, path: &str, style: &Style, width: f32) -> String {
    if g.measure(path, style, 10_000.0).0 <= width {
        return path.to_owned();
    }
    let parts: Vec<&str> = path.split('\\').collect();
    let last = parts.len().saturating_sub(1);
    for keep_head in (1..last.max(1)).rev() {
        let candidate = format!("{}\\\u{2026}\\{}", parts[..keep_head].join("\\"), parts[last]);
        if g.measure(&candidate, style, 10_000.0).0 <= width {
            return candidate;
        }
    }
    format!("\u{2026}\\{}", parts[last])
}

fn options(g: &mut Gfx, ui: &mut Ui) {
    glow(g, Rect::new(28.0, 46.0, 48.0, 48.0), 0.8);
    g.mark(28.0, 46.0, 48.0, theme::MARK);
    g.text(tr(Text::OptionsTitle), &Style::display(18.0), Rect::new(92.0, 46.0, 500.0, 26.0), theme::TEXT);
    g.text(tr(Text::OptionsHint), &Style::text(12.0), Rect::new(92.0, 72.0, 500.0, 20.0), theme::MUTED);
    let card = Rect::new(28.0, 112.0, W - 56.0, 168.0);
    g.fill_round(card, 12.0, theme::PANEL.alpha(0.9));
    for row in 1..3 {
        g.fill_rect(Rect::new(card.x, card.y + 56.0 * row as f32, card.w, 1.0), theme::BORDER.alpha(0.32));
    }
    location_row(g, ui, Rect::new(card.x, card.y, card.w, 56.0));
    install_for_row(g, ui, Rect::new(card.x, card.y + 56.0, card.w, 56.0));
    shortcut_row(g, ui, Rect::new(card.x, card.y + 112.0, card.w, 56.0));
    options_note(g, ui, card.bottom() + 10.0);
    bar(g);
    let back = tr(Text::Back);
    let back_w = widgets::button_width(g, Kind::Ghost, back, Some(icons::ARROW_LEFT), 96.0);
    widgets::button(g, ui, Id::Back, Rect::new(20.0, BUTTON_Y, back_w, BUTTON_H), Kind::Ghost, back, Some(icons::ARROW_LEFT));
    bar_buttons(g, ui, &[(Id::Install, Kind::Primary, install_label(ui))]);
}

fn row_label(g: &Gfx, text: Text, row: Rect) {
    g.text(tr(text), &Style::text(12.5), Rect::new(row.x + 16.0, row.y, 130.0, row.h), theme::TEXT);
}

fn location_row(g: &mut Gfx, ui: &mut Ui, row: Rect) {
    row_label(g, Text::Location, row);
    let browse = tr(Text::Browse);
    let browse_w = widgets::button_width(g, Kind::Mini, browse, Some(icons::FOLDER_OPEN), 0.0);
    let browse_rect = Rect::new(row.right() - 16.0 - browse_w, row.y + 12.0, browse_w, 32.0);
    let field = Rect::new(row.x + 150.0, row.y + 12.0, browse_rect.x - 8.0 - (row.x + 150.0), 32.0);
    g.fill_round(field, 7.0, theme::SUNKEN);
    let style = Style::text(12.0);
    let shown = compact_path(g, &ui.dir, &style, field.w - 20.0);
    g.text(&shown, &style, field.inset(10.0, 0.0), theme::TEXT);
    widgets::button(g, ui, Id::Browse, browse_rect, Kind::Mini, browse, Some(icons::FOLDER_OPEN));
}

fn install_for_row(g: &mut Gfx, ui: &mut Ui, row: Rect) {
    row_label(g, Text::InstallFor, row);
    widgets::segmented(g, ui, (row.x + 150.0, row.y + 12.0), tr(Text::JustMe), tr(Text::AllUsers));
}

fn shortcut_row(g: &mut Gfx, ui: &mut Ui, row: Rect) {
    row_label(g, Text::Shortcut, row);
    g.text(tr(Text::DesktopShortcut), &Style::text(11.5), Rect::new(row.x + 150.0, row.y, 330.0, row.h), theme::MUTED);
    widgets::switch(g, ui, Id::Desktop, Rect::new(row.right() - 16.0 - 38.0, row.y + 17.0, 38.0, 22.0));
}

fn options_note(g: &Gfx, ui: &Ui, y: f32) {
    let style = Style::text(11.5);
    if let Some(problem) = ui.dir_problem {
        g.icon(icons::WARNING, 10.0, Rect::new(28.0, y, 14.0, 18.0), theme::DANGER);
        g.text(tr(problem), &style, Rect::new(48.0, y, W - 76.0, 18.0), theme::DANGER_TEXT);
        return;
    }
    if let Some((free, drive)) = crate::system::free_space(&ui.dir) {
        let need = strings::size(ui.config.required_bytes);
        let note = fill(Text::SpaceNote, &[("need", &need), ("free", &strings::size(free)), ("drive", &drive)]);
        g.text(&note, &style, Rect::new(30.0, y, W - 60.0, 18.0), theme::MUTED);
    }
}

fn progress_block(g: &Gfx, ui: &Ui, y: f32, x: f32, width: f32) {
    let shown = ui.progress.shown();
    let track = Rect::new(x, y, width, 6.0);
    g.fill_round(track, 3.0, theme::SUNKEN);
    let filled = Rect::new(x, y, (width * shown).max(6.0), 6.0);
    g.fill_round(filled, 3.0, theme::ACCENT);
    sheen(g, ui, filled);
    let style = Style::text(12.0);
    if let Some(label) = phase_text(ui.progress.phase()) {
        g.text(tr(label), &style, Rect::new(x, y + 14.0, width - 60.0, 18.0), theme::MUTED);
    }
    let percent = strings::percent(shown * 100.0);
    g.text(&percent, &style.align(Align::End), Rect::new(x + width - 80.0, y + 14.0, 80.0, 18.0), theme::TEXT);
}

/// A soft light running along the filled bar, so a long step never looks frozen.
fn sheen(g: &Gfx, ui: &Ui, filled: Rect) {
    if anim::reduced() || ui.progress.phase() == Phase::Done {
        return;
    }
    let cycle = (anim::elapsed(ui.entered) % 1.8) / 1.8;
    let center = filled.x - 60.0 + (filled.w + 120.0) * cycle;
    let light = theme::WHITE;
    let stops = [(0.0, light.alpha(0.0)), (0.5, light.alpha(0.28)), (1.0, light.alpha(0.0))];
    if let Some(brush) = g.linear((center - 50.0, 0.0), (center + 50.0, 0.0), &stops) {
        g.push_clip(filled);
        g.fill_round_with(filled, 3.0, &brush.into());
        g.pop_clip();
    }
}

fn phase_text(phase: Phase) -> Option<Text> {
    Some(match phase {
        Phase::Preparing => Text::PhasePreparing,
        Phase::Closing => Text::PhaseClosing,
        Phase::Removing => Text::PhaseRemoving,
        Phase::Extracting => Text::PhaseExtracting,
        Phase::Placing => Text::PhasePlacing,
        Phase::Finishing => Text::PhaseFinishing,
        Phase::Files => Text::PhaseFiles,
        Phase::Data => Text::PhaseData,
        Phase::Cleanup => Text::PhaseCleanup,
        Phase::Done => return None,
    })
}

fn progress(g: &mut Gfx, ui: &mut Ui) {
    if ui.mode == Mode::Uninstall {
        title(g, tr(Text::Uninstalling), 128.0 + UNINSTALL_PROGRESS_SHIFT, 23.0);
        progress_block(g, ui, 182.0 + UNINSTALL_PROGRESS_SHIFT, 100.0, 440.0);
        return;
    }
    title(g, tr(Text::Installing), TITLE_Y, 27.0);
    let subtitle = format!("Achievement Watcher Next {}", ui.config.version);
    g.text(&subtitle, &Style::text(13.0).align(Align::Center), Rect::new(40.0, 205.0, W - 80.0, 20.0), theme::MUTED);
    progress_block(g, ui, 251.0, 100.0, 440.0);
}

fn done(g: &mut Gfx, ui: &mut Ui) {
    title(g, tr(Text::DoneTitle), TITLE_Y, 27.0);
    achievement_card(g, ui, Rect::new((W - 344.0) / 2.0, 213.0, 344.0, 70.0));
    bar(g);
    bar_buttons(g, ui, &[(Id::Dismiss, Kind::Ghost, tr(Text::Close)), (Id::Launch, Kind::Primary, tr(Text::Launch))]);
}

/// The AW Next notification preset in miniature: the accent wash, the rail that draws itself
/// down the left edge and the ringed icon plate.
fn achievement_card(g: &mut Gfx, ui: &Ui, card: Rect) {
    let since = anim::elapsed(ui.entered);
    let appear = if anim::reduced() { 1.0 } else { ease_out((since - 0.12) / 0.35) };
    if appear <= 0.0 {
        return;
    }
    let layered = appear < 0.999 && g.push_opacity(appear);
    let card = card.offset(0.0, 10.0 * (1.0 - appear));
    card_surface(g, card);
    let rail = if anim::reduced() { 1.0 } else { ease_out((since - 0.25) / 0.45) };
    if let Some(brush) = g.linear((0.0, card.y + 11.0), (0.0, card.bottom() - 11.0), &[(0.0, theme::WHITE), (0.22, Color::hex(0xB6C9FF)), (1.0, theme::ACCENT)]) {
        // Rounded on the right only, as in the preset: the left half of the shape is clipped away.
        g.push_clip(card);
        g.fill_round_with(Rect::new(card.x - 4.0, card.y + 11.0, 8.0, (card.h - 22.0) * rail.max(0.0)), 4.0, &brush.into());
        g.pop_clip();
    }
    let plate = Rect::new(card.x + 18.0, card.y + 12.0, 46.0, 46.0);
    g.fill_round(plate.inset(-2.0, -2.0), 13.0, theme::ACCENT.alpha(0.7));
    g.fill_round(plate, 11.0, Color::hex(0x0B1322));
    g.mark(plate.x + 8.0, plate.y + 8.0, 30.0, theme::PLATINUM);
    let x = plate.right() + 14.0;
    let width = card.right() - x - 12.0;
    g.text(tr(Text::DoneKicker), &Style::text(11.0), Rect::new(x, card.y + 10.0, width, 16.0), Color::hex(0x9BACC2));
    g.text(tr(Text::DoneCardTitle), &Style::text(14.0).bold(), Rect::new(x, card.y + 25.0, width, 20.0), theme::TEXT);
    g.text(tr(Text::DoneCardDetail), &Style::text(12.0), Rect::new(x, card.y + 44.0, width, 17.0), Color::hex(0xC4CFDD));
    if layered {
        g.pop_layer();
    }
}

fn card_surface(g: &Gfx, card: Rect) {
    g.fill_round(card.offset(0.0, 2.0), 15.0, Color::hexa(0x000000, 0.3));
    let base = [(0.0, Color::hex(0x1E2D49)), (1.0, Color::hex(0x0C1322))];
    if let Some(brush) = g.linear((card.x, card.y), (card.right(), card.bottom()), &base) {
        g.fill_round_with(card, 14.0, &brush.into());
    }
    let wash = [(0.0, theme::ACCENT.alpha(0.20)), (0.5, theme::ACCENT.alpha(0.0))];
    if let Some(brush) = g.linear((card.x, card.y), (card.right(), card.y + 20.0), &wash) {
        g.fill_round_with(card, 14.0, &brush.into());
    }
    g.stroke_round(card, 14.0, theme::WHITE.alpha(0.06), 1.0);
}

fn error(g: &mut Gfx, ui: &mut Ui) {
    let heading = if ui.mode == Mode::Uninstall { Text::ErrorUninstall } else { Text::ErrorInstall };
    title(g, tr(heading), TITLE_Y, 24.0);
    let message = if ui.config.error.is_empty() { tr(Text::ErrorGeneric).to_owned() } else { ui.config.error.clone() };
    body(g, &message, 210.0, 460.0, theme::MUTED);
    bar(g);
    let copied = ui.copied_at.is_some_and(|at| at.elapsed().as_secs_f32() < 2.0);
    let (label, glyph) = if copied { (tr(Text::Copied), icons::CHECK) } else { (tr(Text::CopyDetails), icons::COPY) };
    let width = widgets::button_width(g, Kind::Link, label, Some(glyph), 0.0);
    widgets::button(g, ui, Id::Copy, Rect::new(14.0, BUTTON_Y, width, BUTTON_H), Kind::Link, label, Some(glyph));
    bar_buttons(g, ui, &[(Id::Dismiss, Kind::Ghost, tr(Text::Close)), (Id::Retry, Kind::Primary, tr(Text::Retry))]);
}

// ---- uninstall -----------------------------------------------------------------------------------

fn confirm(g: &mut Gfx, ui: &mut Ui) {
    title(g, tr(Text::UninstallTitle), 128.0, 23.0);
    body(g, tr(Text::UninstallText), 162.0, 440.0, theme::MUTED);
    delete_card(g, ui, Rect::new(48.0, 236.0, W - 96.0, 76.0));
    bar(g);
    if ui.app_running {
        let style = Style::text(12.0);
        g.icon(icons::WARNING, 11.0, Rect::new(20.0, BUTTON_Y, 14.0, BUTTON_H), theme::WARNING);
        g.text(tr(Text::AppRunningUninstall), &style, Rect::new(40.0, BUTTON_Y, 280.0, BUTTON_H), theme::WARNING_TEXT);
    }
    bar_buttons(g, ui, &[(Id::Cancel, Kind::Ghost, tr(Text::Cancel)), (Id::Uninstall, Kind::Danger, tr(Text::Uninstall))]);
}

fn delete_card(g: &mut Gfx, ui: &mut Ui, card: Rect) {
    let on = ui.toggle_amount(Id::DeleteData);
    g.fill_round(card, 12.0, theme::PANEL.alpha(0.9).mix(theme::DANGER.alpha(0.08), on));
    g.stroke_round(card, 12.0, theme::BORDER.alpha(0.3).mix(theme::DANGER.alpha(0.5), on), 1.0);
    widgets::checkbox(g, ui, Id::DeleteData, Rect::new(card.x + 16.0, card.y + 12.0, card.w - 32.0, 20.0), tr(Text::DeleteData), true);
    let size = ui.data_size.lock().ok().and_then(|size| *size);
    let detail = match size {
        Some(bytes) => fill(Text::DeleteDataDetail, &[("size", &strings::size(bytes))]),
        None => tr(Text::DeleteDataMeasuring).to_owned(),
    };
    let x = card.x + 44.0;
    g.text(&detail, &Style::text(11.5), Rect::new(x, card.y + 33.0, card.w - 60.0, 17.0), theme::MUTED);
    if on > 0.01 {
        g.icon(icons::WARNING, 10.0, Rect::new(x, card.y + 51.0, 12.0, 17.0), theme::DANGER.alpha(on));
        g.text(tr(Text::DeleteDataWarning), &Style::text(11.5), Rect::new(x + 18.0, card.y + 51.0, card.w - 78.0, 17.0), theme::DANGER_TEXT.alpha(on));
    }
}

fn removed(g: &mut Gfx, ui: &mut Ui) {
    title(g, tr(Text::RemovedTitle), 128.0 + REMOVED_SHIFT, 23.0);
    let message = if ui.delete_data {
        tr(Text::RemovedDeleted).to_owned()
    } else {
        fill(Text::RemovedKept, &[("path", &ui.config.data_shown)])
    };
    body(g, &message, 162.0 + REMOVED_SHIFT, 460.0, theme::MUTED);
    bar(g);
    bar_buttons(g, ui, &[(Id::Dismiss, Kind::Primary, tr(Text::Close))]);
}

// ---- update ----------------------------------------------------------------------------------------

fn paint_compact(g: &mut Gfx, ui: &mut Ui) {
    let (width, height) = theme::COMPACT_SIZE;
    background(g, width, height, (0.0, 0.0));
    let shown = ui.progress.tick();
    let mark = Rect::new(24.0, 26.0, 56.0, 56.0);
    glow(g, mark, 0.9);
    meter(g, mark, shown, theme::ACCENT);
    if ui.progress.phase() == Phase::Done && !anim::reduced() {
        g.mark_shine(mark.x, mark.y, mark.w, (anim::elapsed(ui.entered) - 0.05) / 0.7, 0.55);
    }
    let finished = ui.progress.phase() == Phase::Done;
    let heading = if finished { tr(Text::Restarting) } else { tr(Text::UpdatingTitle) };
    let x = 104.0;
    g.text(heading, &Style::text(15.0).bold(), Rect::new(x, 22.0, width - x - 24.0, 22.0), theme::TEXT);
    let versions = fill(Text::UpdateVersions, &[("old", &ui.config.old_version), ("new", &ui.config.version)]);
    g.text(&versions, &Style::text(12.0), Rect::new(x, 45.0, width - x - 24.0, 18.0), theme::MUTED);
    progress_block(g, ui, 76.0, x, width - x - 28.0);
}
