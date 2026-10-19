// Prevents an extra console window on Windows in release builds. Don't remove.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  bookbookbook_lib::run();
}
