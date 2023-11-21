use std::{
    collections::HashMap,
    sync::{Arc, Mutex, RwLock},
};

use crate::{
    errors::ErrorWithBacktrace,
    frame_cache::{FrameCache, FrameCacheReference},
    global_printer::_print_verbose,
};
use lazy_static::lazy_static;

pub struct FrameCacheManager {
    transparent: RwLock<HashMap<String, Arc<Mutex<FrameCache>>>>,
    opaque: RwLock<HashMap<String, Arc<Mutex<FrameCache>>>>,
}

impl FrameCacheManager {
    pub fn get_instance() -> &'static FrameCacheManager {
        lazy_static! {
            static ref INSTANCE: FrameCacheManager = make_frame_cache_manager().unwrap();
        }
        &INSTANCE
    }

    fn frame_cache_exists(&self, src: &str, transparent: bool) -> bool {
        match transparent {
            true => self.transparent.read().unwrap().contains_key(src),
            false => self.opaque.read().unwrap().contains_key(src),
        }
    }

    fn add_frame_cache(&self, src: &str, transparent: bool) {
        let frame_cache = FrameCache::new();
        let frame_cache_arc = Arc::new(Mutex::new(frame_cache));
        match transparent {
            true => {
                self.transparent
                    .write()
                    .unwrap()
                    .insert(src.to_string(), frame_cache_arc);
            }
            false => {
                self.opaque
                    .write()
                    .unwrap()
                    .insert(src.to_string(), frame_cache_arc);
            }
        }
    }

    pub fn get_frame_cache(&self, src: &str, transparent: bool) -> Arc<Mutex<FrameCache>> {
        if !self.frame_cache_exists(src, transparent) {
            self.add_frame_cache(src, transparent);
        }

        match transparent {
            true => self.transparent.read().unwrap().get(src).unwrap().clone(),
            false => self.opaque.read().unwrap().get(src).unwrap().clone(),
        }
    }

    pub fn get_cache_item_id(
        &self,
        src: &str,
        transparent: bool,
        time: i64,
        threshold: i64,
    ) -> Result<Option<usize>, ErrorWithBacktrace> {
        Ok(self
            .get_frame_cache(src, transparent)
            .lock()?
            .get_item_id(time, threshold)?)
    }

    pub fn get_cache_item_from_id(
        &self,
        src: &str,
        transparent: bool,
        frame_id: usize,
    ) -> Result<Vec<u8>, ErrorWithBacktrace> {
        match self
            .get_frame_cache(src, transparent)
            .lock()?
            .get_item_from_id(frame_id)?
        {
            Some(item) => Ok(item),
            None => Err(ErrorWithBacktrace::from("No item found in cache")),
        }
    }

    pub fn get_frame_references(&self) -> Result<Vec<FrameCacheReference>, ErrorWithBacktrace> {
        let mut vec: Vec<FrameCacheReference> = Vec::new();
        // 0..2 loops twice, not 0..1
        for i in 0..2 {
            let transparent = i == 0;
            let keys: Vec<String> = match transparent {
                true => self.transparent.read()?.keys().cloned().collect(),
                false => self.opaque.read()?.keys().cloned().collect(),
            };

            for key in keys {
                let src = key.clone();
                let lock = self.get_frame_cache(&src, transparent);
                let frame_cache = lock.lock()?;
                // TODO: original src has been replaced with key
                let references =
                    frame_cache.get_references(src.to_string(), src.to_string(), transparent)?;
                for reference in references {
                    vec.push(reference);
                }
            }
        }

        return Ok(vec);
    }

    fn get_total_size(&self) -> Result<u128, ErrorWithBacktrace> {
        let mut total_size = 0;

        for i in 0..2 {
            let transparent = i == 0;
            let keys: Vec<String> = match transparent {
                // TODO: Potentially unsafe unwrap
                true => self.transparent.read().unwrap().keys().cloned().collect(),
                false => self.opaque.read().unwrap().keys().cloned().collect(),
            };
            for key in keys {
                let src = key.clone();
                let lock = self.get_frame_cache(&src, transparent);
                let frame_cache = lock.lock()?;
                total_size += frame_cache.get_size_in_bytes();
            }
        }

        return Ok(total_size);
    }

    pub fn prune(&self, maximum_frame_cache_size_in_bytes: u128) -> Result<(), ErrorWithBacktrace> {
        let references = FrameCacheManager::get_instance().get_frame_references()?;
        let mut sorted = references.clone();
        sorted.sort_by(|a, b| a.last_used.cmp(&b.last_used));

        let mut pruned = 0;
        for removal in sorted {
            let current_cache_size_in_bytes = self.get_total_size()?;
            if current_cache_size_in_bytes < maximum_frame_cache_size_in_bytes {
                break;
            }
            {
                // let video_locked =
                //  self.get_video(&removal.src, &removal.original_src, removal.transparent)?;
                // let mut video = video_locked.lock()?;
                self.get_frame_cache(&removal.src, removal.transparent)
                    .lock()?
                    .remove_item_by_id(removal.id)?;

                pruned += 1;

                // let closed = video.close_video_if_frame_cache_empty()?;
                // if closed {
                //     self.videos.write()?.remove(&video.src);
                // }
            }
        }

        if pruned > 0 {
            _print_verbose(&format!(
                "Pruned {} to save memory, keeping {}. Total cache size: {}MB",
                pruned,
                self.get_frames_in_cache()?,
                self.get_total_size()? / 1024 / 1024
            ))?;
        }

        Ok(())
    }

    pub fn prune_oldest(
        &self,
        maximum_frame_cache_size_in_bytes: u128,
    ) -> Result<(), ErrorWithBacktrace> {
        self.prune(maximum_frame_cache_size_in_bytes)
    }

    // Should be called if system is about to run out of memory
    pub fn halfen_cache_size(
        &self,
        maximum_frame_cache_size_in_bytes: u128,
    ) -> Result<(), ErrorWithBacktrace> {
        self.prune(maximum_frame_cache_size_in_bytes / 2)
    }

    pub fn get_frames_in_cache(&self) -> Result<usize, ErrorWithBacktrace> {
        let references = self.get_frame_references()?;

        return Ok(references.len());
    }
}

pub fn make_frame_cache_manager() -> Result<FrameCacheManager, ErrorWithBacktrace> {
    Ok(FrameCacheManager {
        transparent: RwLock::new(HashMap::new()),
        opaque: RwLock::new(HashMap::new()),
    })
}
