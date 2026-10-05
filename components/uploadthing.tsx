"use client";

import { generateUploadButton } from "@uploadthing/react";
import type { UploadRouter } from "@/app/api/uploadthing/core";

export const LessonVideoUploadButton = generateUploadButton<UploadRouter>();
