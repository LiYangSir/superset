use alacritty_terminal::term::RenderableContent;
use alacritty_terminal::term::cell::Flags;
use alacritty_terminal::vte::ansi::{Color as AnsiColor, NamedColor};
use glyphon::{
    Attrs, Buffer, Cache, Color, Family, FontSystem, Metrics, Resolution, Shaping, SwashCache,
    TextArea, TextAtlas, TextBounds, TextRenderer, Viewport,
};
use wgpu::util::DeviceExt;

const DEFAULT_FONT_SIZE: f32 = 14.0;
const LINE_HEIGHT_FACTOR: f32 = 1.2;

const DEFAULT_FG: [u8; 3] = [204, 204, 204];
const DEFAULT_BG: [u8; 3] = [30, 30, 30];

const NAMED_COLORS: [[u8; 3]; 18] = [
    [0, 0, 0],       // Black
    [205, 49, 49],    // Red
    [13, 188, 121],   // Green
    [229, 229, 16],   // Yellow
    [36, 114, 200],   // Blue
    [188, 63, 188],   // Magenta
    [17, 168, 205],   // Cyan
    [229, 229, 229],  // White
    [102, 102, 102],  // BrightBlack
    [241, 76, 76],    // BrightRed
    [35, 209, 139],   // BrightGreen
    [245, 245, 67],   // BrightYellow
    [59, 142, 234],   // BrightBlue
    [214, 112, 214],  // BrightMagenta
    [41, 184, 219],   // BrightCyan
    [229, 229, 229],  // BrightWhite
    [204, 204, 204],  // Foreground
    [30, 30, 30],     // Background
];

#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct BgInstance {
    pos: [f32; 2],
    size: [f32; 2],
    color: [f32; 4],
}

pub struct WgpuRenderer {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    pub width: u32,
    pub height: u32,
    format: wgpu::TextureFormat,
    bg_pipeline: wgpu::RenderPipeline,
    font_system: FontSystem,
    swash_cache: SwashCache,
    atlas: TextAtlas,
    viewport: Viewport,
    text_renderer: TextRenderer,
    pub cell_width: f32,
    pub cell_height: f32,
}

impl WgpuRenderer {
    /// # Safety
    /// The window handles must remain valid for the lifetime of the renderer.
    pub unsafe fn new(
        window_handle: raw_window_handle::RawWindowHandle,
        display_handle: raw_window_handle::RawDisplayHandle,
        width: u32,
        height: u32,
    ) -> Self {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor::new_without_display_handle());

        let surface = unsafe {
            instance
                .create_surface_unsafe(wgpu::SurfaceTargetUnsafe::RawHandle {
                    raw_display_handle: Some(display_handle),
                    raw_window_handle: window_handle,
                })
                .expect("create surface")
        };

        let adapter = pollster::block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            compatible_surface: Some(&surface),
            ..Default::default()
        }))
        .expect("request adapter");

        let (device, queue) = pollster::block_on(adapter.request_device(
            &wgpu::DeviceDescriptor {
                label: Some("terminal"),
                ..Default::default()
            },
        ))
        .expect("request device");

        let format = surface.get_capabilities(&adapter).formats[0];
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width,
            height,
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode: wgpu::CompositeAlphaMode::Auto,
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&device, &config);

        let bg_pipeline = create_bg_pipeline(&device, format);

        let mut font_system = FontSystem::new();
        let swash_cache = SwashCache::new();
        let cache = Cache::new(&device);
        let viewport = Viewport::new(&device, &cache);
        let mut atlas = TextAtlas::new(&device, &queue, &cache, format);
        let text_renderer =
            TextRenderer::new(&mut atlas, &device, wgpu::MultisampleState::default(), None);

        let (cell_width, cell_height) = measure_cell(&mut font_system);

        Self {
            surface,
            device,
            queue,
            width,
            height,
            format,
            bg_pipeline,
            font_system,
            swash_cache,
            atlas,
            viewport,
            text_renderer,
            cell_width,
            cell_height,
        }
    }

    pub fn resize(&mut self, width: u32, height: u32) {
        if width == 0 || height == 0 {
            return;
        }
        self.width = width;
        self.height = height;
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: self.format,
            width,
            height,
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode: wgpu::CompositeAlphaMode::Auto,
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        self.surface.configure(&self.device, &config);
    }

    pub fn grid_size(&self) -> (u16, u16) {
        let cols = (self.width as f32 / self.cell_width).floor() as u16;
        let rows = (self.height as f32 / self.cell_height).floor() as u16;
        (cols.max(1), rows.max(1))
    }

    pub fn render(&mut self, content: RenderableContent<'_>) -> bool {
        let output = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(tex) | wgpu::CurrentSurfaceTexture::Suboptimal(tex) => tex,
            wgpu::CurrentSurfaceTexture::Lost | wgpu::CurrentSurfaceTexture::Outdated => {
                self.resize(self.width, self.height);
                return false;
            }
            _ => return false,
        };
        let view = output.texture.create_view(&Default::default());

        let width = self.width;
        let height = self.height;

        let mut bg_instances: Vec<BgInstance> = Vec::new();
        let mut rows: Vec<Vec<(char, [u8; 3])>> = Vec::new();

        let cols = (width as f32 / self.cell_width).floor() as usize;
        let screen_lines = (height as f32 / self.cell_height).floor() as usize;

        for indexed in content.display_iter {
            let point = indexed.point;
            let line = point.line.0;
            if line < 0 || line as usize >= screen_lines {
                continue;
            }
            let row_idx = line as usize;
            let col_idx = point.column.0;
            if col_idx >= cols {
                continue;
            }

            while rows.len() <= row_idx {
                rows.push(vec![(' ', DEFAULT_FG); cols]);
            }

            let cell = &indexed.cell;
            let ch = cell.c;
            let fg = resolve_color(&cell.fg, content.colors, true, cell.flags);
            let bg = resolve_color(&cell.bg, content.colors, false, cell.flags);

            rows[row_idx][col_idx] = (ch, fg);

            if bg != DEFAULT_BG {
                let x = col_idx as f32 * self.cell_width;
                let y = row_idx as f32 * self.cell_height;
                let ndc_x = (x / width as f32) * 2.0 - 1.0;
                let ndc_y = 1.0 - (y / height as f32) * 2.0;
                let ndc_w = (self.cell_width / width as f32) * 2.0;
                let ndc_h = -(self.cell_height / height as f32) * 2.0;
                bg_instances.push(BgInstance {
                    pos: [ndc_x, ndc_y],
                    size: [ndc_w, ndc_h],
                    color: [
                        bg[0] as f32 / 255.0,
                        bg[1] as f32 / 255.0,
                        bg[2] as f32 / 255.0,
                        1.0,
                    ],
                });
            }
        }

        let cursor = &content.cursor;
        let cx = cursor.point.column.0;
        let cy = cursor.point.line.0;
        if cy >= 0 && (cy as usize) < screen_lines && cx < cols {
            let x = cx as f32 * self.cell_width;
            let y = cy as usize as f32 * self.cell_height;
            let ndc_x = (x / width as f32) * 2.0 - 1.0;
            let ndc_y = 1.0 - (y / height as f32) * 2.0;
            let ndc_w = (self.cell_width / width as f32) * 2.0;
            let ndc_h = -(self.cell_height / height as f32) * 2.0;
            bg_instances.push(BgInstance {
                pos: [ndc_x, ndc_y],
                size: [ndc_w, ndc_h],
                color: [0.8, 0.8, 0.8, 1.0],
            });
        }

        let font_size = DEFAULT_FONT_SIZE;
        let line_height = font_size * LINE_HEIGHT_FACTOR;

        let mut buffers: Vec<Buffer> = Vec::with_capacity(rows.len());

        for row in rows.iter() {
            let chars: Vec<String> = row.iter().map(|(ch, _)| ch.to_string()).collect();
            let attrs_list: Vec<Attrs<'_>> = row
                .iter()
                .map(|(_, fg)| {
                    Attrs::new()
                        .family(Family::Monospace)
                        .color(Color::rgb(fg[0], fg[1], fg[2]))
                })
                .collect();

            let span_pairs: Vec<(&str, Attrs<'_>)> = chars
                .iter()
                .zip(attrs_list.iter())
                .map(|(s, a)| (s.as_str(), a.clone()))
                .collect();

            let mut buffer =
                Buffer::new(&mut self.font_system, Metrics::new(font_size, line_height));
            buffer.set_size(
                &mut self.font_system,
                Some(width as f32),
                Some(line_height),
            );
            buffer.set_rich_text(
                &mut self.font_system,
                span_pairs,
                &Attrs::new().family(Family::Monospace),
                Shaping::Advanced,
                None,
            );
            buffer.shape_until_scroll(&mut self.font_system, false);
            buffers.push(buffer);
        }

        let text_areas: Vec<TextArea<'_>> = buffers
            .iter()
            .enumerate()
            .map(|(row_idx, buffer)| TextArea {
                buffer,
                left: 0.0,
                top: row_idx as f32 * line_height,
                scale: 1.0,
                bounds: TextBounds {
                    left: 0,
                    top: 0,
                    right: width as i32,
                    bottom: height as i32,
                },
                default_color: Color::rgb(DEFAULT_FG[0], DEFAULT_FG[1], DEFAULT_FG[2]),
                custom_glyphs: &[],
            })
            .collect();

        self.viewport.update(
            &self.queue,
            Resolution { width, height },
        );

        self.text_renderer
            .prepare(
                &self.device,
                &self.queue,
                &mut self.font_system,
                &mut self.atlas,
                &self.viewport,
                text_areas,
                &mut self.swash_cache,
            )
            .expect("prepare text");

        let bg_buffer = if bg_instances.is_empty() {
            None
        } else {
            Some(
                self.device
                    .create_buffer_init(&wgpu::util::BufferInitDescriptor {
                        label: Some("bg instances"),
                        contents: bytemuck::cast_slice(&bg_instances),
                        usage: wgpu::BufferUsages::VERTEX,
                    }),
            )
        };

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("terminal render"),
            });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("terminal"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: DEFAULT_BG[0] as f64 / 255.0,
                            g: DEFAULT_BG[1] as f64 / 255.0,
                            b: DEFAULT_BG[2] as f64 / 255.0,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                ..Default::default()
            });

            if let Some(ref buf) = bg_buffer {
                pass.set_pipeline(&self.bg_pipeline);
                pass.set_vertex_buffer(0, buf.slice(..));
                pass.draw(0..6, 0..bg_instances.len() as u32);
            }

            self.text_renderer
                .render(&self.atlas, &self.viewport, &mut pass)
                .expect("render text");
        }

        self.queue.submit(std::iter::once(encoder.finish()));
        output.present();
        self.atlas.trim();

        true
    }
}

fn measure_cell(font_system: &mut FontSystem) -> (f32, f32) {
    let font_size = DEFAULT_FONT_SIZE;
    let line_height = font_size * LINE_HEIGHT_FACTOR;
    let mut buffer = Buffer::new(font_system, Metrics::new(font_size, line_height));
    buffer.set_size(font_system, Some(200.0), Some(line_height));
    buffer.set_text(
        font_system,
        "M",
        &Attrs::new().family(Family::Monospace),
        Shaping::Advanced,
        None,
    );
    buffer.shape_until_scroll(font_system, false);

    let mut width = font_size * 0.6;
    for run in buffer.layout_runs() {
        for glyph in run.glyphs.iter() {
            width = glyph.w;
            break;
        }
        break;
    }
    (width, line_height)
}

fn resolve_color(
    color: &AnsiColor,
    colors: &alacritty_terminal::term::color::Colors,
    is_fg: bool,
    flags: Flags,
) -> [u8; 3] {
    match color {
        AnsiColor::Spec(rgb) => [rgb.r, rgb.g, rgb.b],
        AnsiColor::Named(name) => {
            let idx = *name as usize;
            if let Some(rgb) = colors[idx] {
                return [rgb.r, rgb.g, rgb.b];
            }
            if flags.contains(Flags::DIM) && is_fg {
                if matches!(name, NamedColor::Foreground) {
                    return [128, 128, 128];
                }
            }
            match *name {
                NamedColor::Foreground => DEFAULT_FG,
                NamedColor::Background => DEFAULT_BG,
                NamedColor::Cursor => [255, 255, 255],
                _ if idx < NAMED_COLORS.len() => NAMED_COLORS[idx],
                _ => {
                    if is_fg {
                        DEFAULT_FG
                    } else {
                        DEFAULT_BG
                    }
                }
            }
        }
        AnsiColor::Indexed(idx) => {
            let i = *idx as usize;
            if let Some(rgb) = colors[i] {
                return [rgb.r, rgb.g, rgb.b];
            }
            if i < 16 {
                if i < NAMED_COLORS.len() {
                    NAMED_COLORS[i]
                } else if is_fg {
                    DEFAULT_FG
                } else {
                    DEFAULT_BG
                }
            } else if i < 232 {
                let i = i - 16;
                let r = (i / 36) as u8;
                let g = ((i / 6) % 6) as u8;
                let b = (i % 6) as u8;
                let to_val = |v: u8| if v == 0 { 0u8 } else { 55 + 40 * v };
                [to_val(r), to_val(g), to_val(b)]
            } else {
                let v = 8 + 10 * (i - 232) as u8;
                [v, v, v]
            }
        }
    }
}

fn create_bg_pipeline(device: &wgpu::Device, format: wgpu::TextureFormat) -> wgpu::RenderPipeline {
    let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("bg shader"),
        source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()),
    });

    let layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
        label: Some("bg pipeline layout"),
        bind_group_layouts: &[],
        immediate_size: 0,
    });

    device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
        label: Some("bg pipeline"),
        layout: Some(&layout),
        vertex: wgpu::VertexState {
            module: &shader,
            entry_point: Some("vs_main"),
            buffers: &[wgpu::VertexBufferLayout {
                array_stride: std::mem::size_of::<BgInstance>() as u64,
                step_mode: wgpu::VertexStepMode::Instance,
                attributes: &[
                    wgpu::VertexAttribute {
                        offset: 0,
                        shader_location: 0,
                        format: wgpu::VertexFormat::Float32x2,
                    },
                    wgpu::VertexAttribute {
                        offset: 8,
                        shader_location: 1,
                        format: wgpu::VertexFormat::Float32x2,
                    },
                    wgpu::VertexAttribute {
                        offset: 16,
                        shader_location: 2,
                        format: wgpu::VertexFormat::Float32x4,
                    },
                ],
            }],
            compilation_options: Default::default(),
        },
        fragment: Some(wgpu::FragmentState {
            module: &shader,
            entry_point: Some("fs_main"),
            targets: &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            compilation_options: Default::default(),
        }),
        primitive: wgpu::PrimitiveState {
            topology: wgpu::PrimitiveTopology::TriangleList,
            ..Default::default()
        },
        depth_stencil: None,
        multisample: wgpu::MultisampleState::default(),
        multiview_mask: None,
        cache: None,
    })
}
