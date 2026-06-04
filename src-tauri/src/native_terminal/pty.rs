use std::fs::File;
use std::io::{self, Write};
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::process::CommandExt;
use std::process::{Child, Command, Stdio};

pub struct PtyProcess {
    master_fd: OwnedFd,
    writer: File,
    pub child: Child,
}

impl PtyProcess {
    pub fn spawn(cols: u16, rows: u16, cwd: &str) -> io::Result<Self> {
        let (master, slave) = open_pty(rows, cols)?;

        let master_for_write = master.try_clone()?;
        let slave_stdin = slave.try_clone()?;
        let slave_stdout = slave.try_clone()?;
        let slave_stderr = slave;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

        let child = unsafe {
            Command::new(&shell)
                .arg("-l")
                .stdin(Stdio::from(slave_stdin))
                .stdout(Stdio::from(slave_stdout))
                .stderr(Stdio::from(slave_stderr))
                .env("TERM", "xterm-256color")
                .current_dir(cwd)
                .pre_exec(|| {
                    libc::setsid();
                    libc::ioctl(0, libc::TIOCSCTTY as libc::c_ulong, 0);
                    Ok(())
                })
                .spawn()?
        };

        Ok(Self {
            master_fd: master,
            writer: File::from(master_for_write),
            child,
        })
    }

    pub fn take_reader(&self) -> io::Result<File> {
        let reader_fd = self.master_fd.try_clone()?;
        Ok(File::from(reader_fd))
    }

    pub fn resize(&self, cols: u16, rows: u16) -> io::Result<()> {
        resize_pty(&self.master_fd, rows, cols)
    }

    pub fn write_all(&mut self, data: &[u8]) -> io::Result<()> {
        self.writer.write_all(data)?;
        self.writer.flush()
    }
}

impl Drop for PtyProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
    }
}

fn open_pty(rows: u16, cols: u16) -> io::Result<(OwnedFd, OwnedFd)> {
    let mut master: libc::c_int = 0;
    let mut slave: libc::c_int = 0;
    let mut ws = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let ret = unsafe {
        libc::openpty(
            &mut master,
            &mut slave,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
            &mut ws,
        )
    };
    if ret != 0 {
        return Err(io::Error::last_os_error());
    }
    unsafe { Ok((OwnedFd::from_raw_fd(master), OwnedFd::from_raw_fd(slave))) }
}

fn resize_pty(fd: &OwnedFd, rows: u16, cols: u16) -> io::Result<()> {
    let ws = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    let ret = unsafe { libc::ioctl(fd.as_raw_fd(), libc::TIOCSWINSZ, &ws) };
    if ret != 0 {
        return Err(io::Error::last_os_error());
    }
    Ok(())
}
