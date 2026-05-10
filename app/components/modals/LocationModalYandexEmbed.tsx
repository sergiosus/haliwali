"use client";

/**
 * Dedicated entry for dynamic import — keeps `LocationModal` from pulling Yandex Maps
 * into the main chunk when {@link LocationModal}'s homepage usage sets `hideMapPreview`.
 */

import { YandexMapPicker } from "../maps/YandexMapPicker";

export default YandexMapPicker;
