//! Controls drawn in the app's style: buttons, the check box, the switch, the segmented choice and
//! the caption. Each one registers its rectangle so input can find it.

use crate::fonts::Family;
use crate::gfx::{Align, Gfx, Rect, Style};
use crate::icons;
use crate::strings::{Text, tr};
use crate::theme::{self, Color};
use crate::ui::{Id, Ui};

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Primary,
    Danger,
    Ghost,
    Link,
    Mini,
}

const LABEL: Style = Style::text(13.0).align(Align::Center);
const FOCUS_GAP: f32 = 3.0;

fn focus_ring(g: &Gfx, ui: &Ui, id: Id, rect: Rect, radius: f32) {
    if ui.shows_focus(id) {
        g.stroke_round(rect.inset(-FOCUS_GAP, -FOCUS_GAP), radius + FOCUS_GAP, theme::FOCUS, 2.0);
    }
}

fn pressed(ui: &Ui, id: Id) -> bool {
    ui.pressed == Some(id) && ui.hover == Some(id)
}

/// The width a button needs for its label, never under `min`.
pub fn button_width(g: &Gfx, kind: Kind, label: &str, icon: Option<char>, min: f32) -> f32 {
    let style = if matches!(kind, Kind::Primary | Kind::Danger) { LABEL.bold() } else { LABEL };
    let padding = if kind == Kind::Mini { 24.0 } else { 36.0 };
    let icon_room = if icon.is_some() { 20.0 } else { 0.0 };
    (g.measure(label, &style, 1000.0).0 + padding + icon_room).ceil().max(min)
}

pub fn button(g: &mut Gfx, ui: &mut Ui, id: Id, rect: Rect, kind: Kind, label: &str, icon: Option<char>) {
    ui.hit(id, rect);
    let hover = ui.hover_amount(id);
    let down = pressed(ui, id);
    let radius = if kind == Kind::Mini { 7.0 } else { 8.0 };
    let (fill, ink, bold) = match kind {
        Kind::Primary => (Some(theme::ACCENT.mix(theme::WHITE, 0.10 * hover)), theme::ON_ACCENT, true),
        Kind::Danger => (Some(theme::DANGER.mix(theme::WHITE, 0.10 * hover)), theme::ON_DANGER, true),
        Kind::Ghost | Kind::Mini => (Some(theme::SURFACE.mix(theme::ELEVATED, hover)), theme::TEXT, false),
        Kind::Link => (None, theme::MUTED.mix(theme::TEXT, hover), false),
    };
    if kind == Kind::Primary {
        g.fill_round(rect.offset(0.0, 5.0).inset(2.0, 1.0), radius + 2.0, theme::ACCENT.alpha(0.10 + 0.06 * hover));
        g.fill_round(rect.offset(0.0, 8.0).inset(8.0, 2.0), radius + 4.0, theme::ACCENT.alpha(0.06));
    }
    if let Some(fill) = fill {
        let fill = if down { fill.mix(theme::BG, 0.18) } else { fill };
        g.fill_round(rect, radius, fill);
    }
    let style = Style { bold, size: if kind == Kind::Mini { 12.0 } else { 13.0 }, ..LABEL };
    let text_width = g.measure(label, &style, rect.w).0;
    let icon_room = if icon.is_some() { 20.0 } else { 0.0 };
    let start = rect.x + (rect.w - text_width - icon_room) / 2.0;
    if let Some(glyph) = icon {
        g.icon(glyph, 11.0, Rect::new(start, rect.y, 14.0, rect.h), ink);
    }
    g.text(label, &Style { align: Align::Start, ..style }, Rect::new(start + icon_room, rect.y, text_width + 2.0, rect.h), ink);
    focus_ring(g, ui, id, rect, radius);
}

/// A check box with its label to the right; the whole row is the target.
pub fn checkbox(g: &mut Gfx, ui: &mut Ui, id: Id, row: Rect, label: &str, danger: bool) {
    ui.hit(id, row);
    let on = ui.toggle_amount(id);
    let hover = ui.hover_amount(id);
    let tint = if danger { theme::DANGER } else { theme::ACCENT };
    let tick = if danger { theme::ON_DANGER } else { theme::ON_ACCENT };
    let boxed = Rect::new(row.x, row.y + 1.0, 18.0, 18.0);
    let edge = theme::CONTROL_EDGE.mix(theme::TEXT, 0.35 * hover);
    g.stroke_round(boxed, 5.0, edge.alpha(1.0 - on), 1.5);
    g.fill_round(boxed, 5.0, tint.alpha(on));
    if on > 0.01 {
        g.icon(icons::CHECK, 10.0, boxed, tick.alpha(on));
    }
    g.text(label, &Style::text(12.5), Rect::new(row.x + 28.0, row.y, row.w - 28.0, 20.0), theme::TEXT);
    focus_ring(g, ui, id, boxed, 5.0);
}

pub fn switch(g: &mut Gfx, ui: &mut Ui, id: Id, rect: Rect) {
    ui.hit(id, rect.inset(-6.0, -6.0));
    let on = ui.toggle_amount(id);
    let hover = ui.hover_amount(id);
    let off_track = Color::hex(0x2A3A50).mix(Color::hex(0x34465E), hover);
    g.fill_round(rect, rect.h / 2.0, off_track.mix(theme::ACCENT, on));
    let knob = rect.h - 6.0;
    let x = rect.x + 3.0 + (rect.w - knob - 6.0) * crate::anim::ease_in_out(on);
    g.fill_circle(x + knob / 2.0, rect.y + rect.h / 2.0, knob / 2.0, Color::hex(0x9AA9BD).mix(theme::WHITE, on));
    focus_ring(g, ui, id, rect, rect.h / 2.0);
}

/// Two choices in one sunken track; the raised pill slides to the chosen one.
pub fn segmented(g: &mut Gfx, ui: &mut Ui, origin: (f32, f32), left: &str, right: &str) {
    let style = Style::text(12.0);
    let pad = 12.0;
    let left_w = g.measure(left, &style, 400.0).0 + pad * 2.0;
    let right_w = g.measure(right, &style, 400.0).0 + pad * 2.0 + 16.0;
    let track = Rect::new(origin.0, origin.1, left_w + right_w + 6.0, 32.0);
    g.fill_round(track, 9.0, theme::SUNKEN);
    let left_rect = Rect::new(track.x + 3.0, track.y + 3.0, left_w, 26.0);
    let right_rect = Rect::new(left_rect.right(), track.y + 3.0, right_w, 26.0);
    let t = crate::anim::ease_in_out(ui.toggle_amount(Id::AllUsers));
    let pill = Rect::new(left_rect.x + (right_rect.x - left_rect.x) * t, left_rect.y, left_w + (right_w - left_w) * t, 26.0);
    g.fill_round(pill, 6.0, theme::ELEVATED);
    for (id, rect, label, selected) in [(Id::JustMe, left_rect, left, 1.0 - t), (Id::AllUsers, right_rect, right, t)] {
        ui.hit(id, rect);
        let hover = ui.hover_amount(id);
        let ink = theme::MUTED.mix(theme::TEXT, selected.max(hover * 0.6));
        let text_rect = Rect::new(rect.x + pad, rect.y, rect.w - pad * 2.0, rect.h);
        let width = g.text(label, &style, text_rect, ink);
        if id == Id::AllUsers {
            g.icon(icons::SHIELD, 10.0, Rect::new(text_rect.x + width + 4.0, rect.y, 14.0, rect.h), theme::WARNING);
        }
        focus_ring(g, ui, id, rect, 6.0);
    }
}

/// The custom title bar: the mark, the caption, and the minimise and close buttons.
pub fn caption(g: &mut Gfx, ui: &mut Ui, width: f32, title: Text, closable: bool) {
    g.mark(14.0, 12.0, 16.0, theme::TEXT.alpha(0.85));
    g.text(tr(title), &Style::text(12.0), Rect::new(39.0, 0.0, 300.0, theme::CAPTION_HEIGHT), theme::MUTED);
    let close = Rect::new(width - theme::CAPTION_BUTTON_WIDTH, 0.0, theme::CAPTION_BUTTON_WIDTH, theme::CAPTION_HEIGHT);
    let minimize = close.offset(-theme::CAPTION_BUTTON_WIDTH, 0.0);
    ui.hit(Id::Minimize, minimize);
    let hover = ui.hover_amount(Id::Minimize);
    g.fill_rect(minimize, theme::WHITE.alpha(0.08 * hover));
    g.icon(icons::MINIMIZE, 10.0, minimize, theme::MUTED.mix(theme::TEXT, hover));
    if closable {
        ui.hit(Id::Close, close);
    }
    let hover = if closable { ui.hover_amount(Id::Close) } else { 0.0 };
    g.fill_rect(close, theme::CLOSE_HOVER.alpha(hover));
    let ink = if closable { theme::MUTED.mix(theme::WHITE, hover) } else { theme::MUTED.alpha(0.3) };
    g.icon(icons::CLOSE, 11.0, close, ink);
}

/// The "NEXT" line under the product name: the word between two short rules, as on the brand art.
pub fn next_tag(g: &Gfx, center_x: f32, y: f32) {
    let style = Style { family: Family::Display, bold: true, size: 12.0, tracking: 5.0, ..Style::text(12.0) };
    let width = g.measure("NEXT", &style, 200.0).0 - 5.0;
    let rule = 34.0;
    let gap = 12.0;
    let left = center_x - width / 2.0;
    g.text("NEXT", &style, Rect::new(left, y, width + 10.0, 14.0), theme::ACCENT_TEXT);
    let mid = y + 7.0;
    g.fill_round(Rect::new(left - gap - rule, mid - 1.0, rule, 2.0), 1.0, theme::ACCENT.alpha(0.85));
    g.fill_round(Rect::new(left + width + gap, mid - 1.0, rule, 2.0), 1.0, theme::ACCENT.alpha(0.85));
}
