use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use alacritty_terminal::event::{Event, EventListener};
use alacritty_terminal::grid::Dimensions;
use alacritty_terminal::term::{Config, RenderableContent, Term};
use alacritty_terminal::vte::ansi;

struct Listener {
    dirty: Arc<AtomicBool>,
}

impl EventListener for Listener {
    fn send_event(&self, _event: Event) {
        self.dirty.store(true, Ordering::Relaxed);
    }
}

struct TermSize {
    columns: usize,
    screen_lines: usize,
}

impl TermSize {
    fn new(cols: u16, rows: u16) -> Self {
        Self {
            columns: cols as usize,
            screen_lines: rows as usize,
        }
    }
}

impl Dimensions for TermSize {
    fn total_lines(&self) -> usize {
        self.screen_lines
    }

    fn screen_lines(&self) -> usize {
        self.screen_lines
    }

    fn columns(&self) -> usize {
        self.columns
    }
}

pub struct TerminalState {
    term: Term<Listener>,
    processor: ansi::Processor,
}

impl TerminalState {
    pub fn new(cols: u16, rows: u16, dirty: Arc<AtomicBool>) -> Self {
        let size = TermSize::new(cols, rows);
        let listener = Listener { dirty };
        let term = Term::new(Config::default(), &size, listener);
        Self {
            term,
            processor: ansi::Processor::new(),
        }
    }

    pub fn feed(&mut self, bytes: &[u8]) {
        self.processor.advance(&mut self.term, bytes);
    }

    pub fn renderable_content(&self) -> RenderableContent<'_> {
        self.term.renderable_content()
    }

    pub fn resize(&mut self, cols: u16, rows: u16) {
        self.term.resize(TermSize::new(cols, rows));
    }

    #[allow(dead_code)]
    pub fn columns(&self) -> usize {
        self.term.columns()
    }

    #[allow(dead_code)]
    pub fn screen_lines(&self) -> usize {
        self.term.screen_lines()
    }
}
