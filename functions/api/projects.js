function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "content-type":
          "application/json; charset=utf-8"
      }
    }
  );
}


function bytesToBase64(bytes) {
  let binary = "";

  const chunkSize = 0x8000;

  for (
    let i = 0;
    i < bytes.length;
    i += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        i,
        i + chunkSize
      )
    );
  }

  return btoa(binary);
}


function decodeBase64(value) {
  const binary = atob(
    value.replace(/\n/g, "")
  );

  const bytes =
    Uint8Array.from(
      binary,
      char => char.charCodeAt(0)
    );

  return new TextDecoder()
    .decode(bytes);
}


function safeString(value) {
  return JSON.stringify(
    String(value || "")
  );
}


function findProjectBlock(
  source,
  projectNumber
) {
  const startPattern =
    new RegExp(
      `^\\s*"${projectNumber}"\\s*:\\s*\\{`,
      "m"
    );

  const startMatch =
    startPattern.exec(source);

  if (!startMatch) {
    return null;
  }

  const start = startMatch.index;
  const afterStart =
    start + startMatch[0].length;

  const nextMatch =
    /^\s*"\d{2}"\s*:\s*\{/m.exec(
      source.slice(afterStart)
    );

  let end;

  if (nextMatch) {
    end = afterStart + nextMatch.index;
  }
  else {
    const helperIndex =
      source.indexOf(
        "PROJECT HELPER FUNCTIONS",
        afterStart
      );

    end = source.lastIndexOf(
      "\n};",
      helperIndex === -1
        ? source.length
        : helperIndex
    );
  }

  if (end <= start) {
    return null;
  }

  return {
    start,
    end,
    block: source.slice(start, end)
  };
}


function readProjectString(
  block,
  fieldName
) {
  const pattern =
    new RegExp(
      `\\n\\s*${fieldName}\\s*:\\s*` +
      `("(?:\\\\.|[^"\\\\])*")`
    );

  const match = pattern.exec(block);

  if (!match) {
    return "";
  }

  try {
    return JSON.parse(match[1]);
  }
  catch {
    return "";
  }
}


function replaceProjectString(
  block,
  fieldName,
  value
) {
  const pattern =
    new RegExp(
      `(\\n\\s*${fieldName}\\s*:\\s*)` +
      `"(?:\\\\.|[^"\\\\])*"`
    );

  if (!pattern.test(block)) {
    throw new Error(
      `Project field not found: ${fieldName}`
    );
  }

  return block.replace(
    pattern,
    (match, prefix) =>
      prefix + safeString(value)
  );
}


function replaceProjectNumber(
  block,
  fieldName,
  value
) {
  const pattern =
    new RegExp(
      `(\\n\\s*${fieldName}\\s*:\\s*)` +
      `-?\\d+(?:\\.\\d+)?`
    );

  if (!pattern.test(block)) {
    throw new Error(
      `Project field not found: ${fieldName}`
    );
  }

  return block.replace(
    pattern,
    (match, prefix) =>
      prefix + String(value)
  );
}


export async function onRequestPost({
  request,
  env
}) {

  try {

    /* ------------------------------
       ADMIN AUTH
    ------------------------------ */

    const adminKey =
      request.headers.get(
        "x-admin-key"
      );

    if (
      !env.ADMIN_KEY ||
      adminKey !== env.ADMIN_KEY
    ) {
      return json(
        {
          ok: false,
          error: "Unauthorized"
        },
        401
      );
    }


    /* ------------------------------
       FORM DATA
    ------------------------------ */

    const formData =
      await request.formData();

    const title =
      String(
        formData.get("title") || ""
      ).trim();

    const category =
      String(
        formData.get("category") || ""
      ).trim();

    const location =
      String(
        formData.get("location") || ""
      ).trim();

    const slug =
      String(
        formData.get("slug") || ""
      )
        .trim()
        .toLowerCase();

    const cover =
      formData.get("cover");


    if (!title || !category || !slug) {
      return json(
        {
          ok: false,
          error:
            "Missing required fields"
        },
        400
      );
    }


    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/
        .test(slug)
    ) {
      return json(
        {
          ok: false,
          error: "Invalid slug"
        },
        400
      );
    }


    if (
      !(cover instanceof File) ||
      cover.size === 0
    ) {
      return json(
        {
          ok: false,
          error:
            "Cover image is required"
        },
        400
      );
    }


    /* ------------------------------
       GITHUB SETTINGS
    ------------------------------ */

    const owner =
      env.GITHUB_OWNER;

    const repo =
      env.GITHUB_REPO;

    const branch =
      env.GITHUB_BRANCH || "main";

    const token =
      env.GITHUB_TOKEN;


    if (
      !owner ||
      !repo ||
      !token
    ) {
      return json(
        {
          ok: false,
          error:
            "GitHub environment variables missing"
        },
        500
      );
    }


    const githubHeaders = {
      Authorization:
        `Bearer ${token}`,

      Accept:
        "application/vnd.github+json",

      "X-GitHub-Api-Version":
        "2022-11-28",

      "User-Agent":
        "ARSTINLA-Project-Manager"
    };


    /* ------------------------------
       READ project-data.js
    ------------------------------ */

    const dataUrl =
      `https://api.github.com/repos/` +
      `${owner}/${repo}/contents/` +
      `project-data.js` +
      `?ref=${encodeURIComponent(branch)}`;


    const dataResponse =
      await fetch(
        dataUrl,
        {
          headers: githubHeaders
        }
      );


if (!dataResponse.ok) {

  const details =
    await dataResponse.text();

  return json(
    {
      ok: false,
      error:
        "Cannot read project-data.js",
      status:
        dataResponse.status,
      details
    },
    500
  );
}

    return completeProjectCreation({
      dataResponse,
      title,
      category,
      location,
      slug,
      cover,
      owner,
      repo,
      branch,
      githubHeaders
    });
  }
  catch (error) {
    return json(
      {
        ok: false,
        error:
          error?.message ||
          "Unknown error"
      },
      500
    );
  }
}


export async function onRequestPut({
  request,
  env
}) {

  try {
    const adminKey =
      request.headers.get(
        "x-admin-key"
      );

    if (
      !env.ADMIN_KEY ||
      adminKey !== env.ADMIN_KEY
    ) {
      return json(
        {
          ok: false,
          error: "Unauthorized"
        },
        401
      );
    }

    const formData =
      await request.formData();

    const projectNumber =
      String(
        formData.get(
          "projectNumber"
        ) || ""
      ).trim();

    const title =
      String(
        formData.get("title") || ""
      ).trim();

    const category =
      String(
        formData.get("category") || ""
      ).trim();

    const location =
      String(
        formData.get("location") || ""
      ).trim();

    const area =
      String(
        formData.get("area") || ""
      ).trim();

    const year =
      String(
        formData.get("year") || ""
      ).trim();

    const completion =
      String(
        formData.get("completion") || ""
      ).trim();

    const service =
      String(
        formData.get("service") || ""
      ).trim();

    const cover =
      formData.get("cover");

    const removeOldCover =
      formData.get("removeOldCover") ===
        "yes";

    const categoryLabels = {
      residential: "Residential",
      "tiny-house": "Tiny House",
      commercial: "Commercial",
      public: "Public & Institutional",
      urban: "Urban",
      interior: "Interior",
      consult: "Consult"
    };

    if (
      !/^\d{2}$/.test(projectNumber) ||
      !title ||
      !categoryLabels[category]
    ) {
      return json(
        {
          ok: false,
          error:
            "Invalid project information"
        },
        400
      );
    }

    if (
      (year && !/^\d{4}$/.test(year)) ||
      (
        completion &&
        !/^\d{4}$/.test(completion)
      )
    ) {
      return json(
        {
          ok: false,
          error:
            "Year must contain 4 digits"
        },
        400
      );
    }

    const hasNewCover =
      cover &&
      typeof cover.arrayBuffer ===
        "function" &&
      cover.size > 0;

    const allowedCoverTypes =
      new Set([
        "image/jpeg",
        "image/png",
        "image/webp"
      ]);

    if (
      hasNewCover &&
      !allowedCoverTypes.has(cover.type)
    ) {
      return json(
        {
          ok: false,
          error:
            "Cover must be JPG, PNG or WEBP"
        },
        400
      );
    }

    if (
      hasNewCover &&
      cover.size > 15 * 1024 * 1024
    ) {
      return json(
        {
          ok: false,
          error:
            "Cover image is larger than 15 MB"
        },
        400
      );
    }

    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const branch =
      env.GITHUB_BRANCH || "main";
    const token = env.GITHUB_TOKEN;

    if (!owner || !repo || !token) {
      return json(
        {
          ok: false,
          error:
            "GitHub environment variables missing"
        },
        500
      );
    }

    const githubHeaders = {
      Authorization: `Bearer ${token}`,
      Accept:
        "application/vnd.github+json",
      "X-GitHub-Api-Version":
        "2022-11-28",
      "User-Agent":
        "ARSTINLA-Project-Manager"
    };

    const dataUrl =
      `https://api.github.com/repos/` +
      `${owner}/${repo}/contents/` +
      `project-data.js` +
      `?ref=${encodeURIComponent(branch)}`;

    const dataResponse =
      await fetch(
        dataUrl,
        { headers: githubHeaders }
      );

    if (!dataResponse.ok) {
      const details =
        await dataResponse.text();

      return json(
        {
          ok: false,
          error:
            "Cannot read project-data.js",
          status: dataResponse.status,
          details
        },
        500
      );
    }

    const dataFile =
      await dataResponse.json();

    const source =
      decodeBase64(dataFile.content);

    const projectRange =
      findProjectBlock(
        source,
        projectNumber
      );

    if (!projectRange) {
      return json(
        {
          ok: false,
          error:
            `Project ${projectNumber} not found`
        },
        404
      );
    }

    const oldFilterCategory =
      readProjectString(
        projectRange.block,
        "filterCategory"
      );

    const oldThumbnail =
      readProjectString(
        projectRange.block,
        "thumbnail"
      );

    const oldHero =
      readProjectString(
        projectRange.block,
        "hero"
      );

    let updatedBlock =
      projectRange.block;

    updatedBlock = replaceProjectString(
      updatedBlock,
      "title",
      title
    );

    updatedBlock = replaceProjectString(
      updatedBlock,
      "filterCategory",
      category
    );

    if (oldFilterCategory !== category) {
      updatedBlock = replaceProjectString(
        updatedBlock,
        "category",
        categoryLabels[category]
      );
    }

    updatedBlock = replaceProjectString(
      updatedBlock,
      "location",
      location
    );

    updatedBlock = replaceProjectString(
      updatedBlock,
      "area",
      area
    );

    const areaNumberMatch =
      area
        .replace(/,/g, "")
        .match(/\d+(?:\.\d+)?/);

    updatedBlock = replaceProjectNumber(
      updatedBlock,
      "areaNumber",
      areaNumberMatch
        ? Number(areaNumberMatch[0])
        : 0
    );

    updatedBlock = replaceProjectString(
      updatedBlock,
      "year",
      year
    );

    updatedBlock = replaceProjectString(
      updatedBlock,
      "completion",
      completion
    );

    updatedBlock = replaceProjectString(
      updatedBlock,
      "service",
      service
    );

    let coverWebPath = "";

    if (hasNewCover) {
      const extensionByType = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/webp": "webp"
      };

      const extension =
        extensionByType[cover.type];

      coverWebPath =
        `/assets/project-${projectNumber}.${extension}`;

      updatedBlock = replaceProjectString(
        updatedBlock,
        "thumbnail",
        coverWebPath
      );

      if (
        !oldHero ||
        oldHero === oldThumbnail
      ) {
        updatedBlock = replaceProjectString(
          updatedBlock,
          "hero",
          coverWebPath
        );

        updatedBlock = replaceProjectString(
          updatedBlock,
          "heroAlt",
          title
        );
      }

      const coverGithubPath =
        coverWebPath.replace(/^\//, "");

      const coverUploadUrl =
        `https://api.github.com/repos/` +
        `${owner}/${repo}/contents/` +
        `${coverGithubPath}`;

      const existingCoverResponse =
        await fetch(
          `${coverUploadUrl}?ref=${encodeURIComponent(branch)}`,
          { headers: githubHeaders }
        );

      let existingCoverSha = null;

      if (existingCoverResponse.ok) {
        const existingCover =
          await existingCoverResponse.json();

        existingCoverSha =
          existingCover.sha;
      }

      const coverBytes =
        new Uint8Array(
          await cover.arrayBuffer()
        );

      const coverPayload = {
        message:
          `Update Project ${projectNumber} cover`,
        content:
          bytesToBase64(coverBytes),
        branch
      };

      if (existingCoverSha) {
        coverPayload.sha =
          existingCoverSha;
      }

      const coverUpload =
        await fetch(
          coverUploadUrl,
          {
            method: "PUT",
            headers: {
              ...githubHeaders,
              "content-type":
                "application/json"
            },
            body:
              JSON.stringify(
                coverPayload
              )
          }
        );

      if (!coverUpload.ok) {
        const details =
          await coverUpload.text();

        return json(
          {
            ok: false,
            error:
              "Cover upload failed",
            details
          },
          500
        );
      }
    }

    const updatedSource =
      source.slice(0, projectRange.start) +
      updatedBlock +
      source.slice(projectRange.end);

    const updatedBytes =
      new TextEncoder()
        .encode(updatedSource);

    const updateResponse =
      await fetch(
        `https://api.github.com/repos/` +
        `${owner}/${repo}/contents/` +
        `project-data.js`,
        {
          method: "PUT",
          headers: {
            ...githubHeaders,
            "content-type":
              "application/json"
          },
          body: JSON.stringify({
            message:
              `Edit Project ${projectNumber}: ${title}`,
            content:
              bytesToBase64(updatedBytes),
            sha: dataFile.sha,
            branch
          })
        }
      );

    if (!updateResponse.ok) {
      const details =
        await updateResponse.text();

      return json(
        {
          ok: false,
          error:
            "project-data.js update failed",
          details
        },
        500
      );
    }

    let oldCoverDeleted = false;
    let warning = "";

    const oldCoverStillUsed =
      oldThumbnail &&
      updatedBlock.includes(
        safeString(oldThumbnail)
      );

    if (
      hasNewCover &&
      removeOldCover &&
      oldThumbnail &&
      oldThumbnail !== coverWebPath &&
      !oldCoverStillUsed &&
      /^\/assets\/project-[^/]+\.(?:jpg|jpeg|png|webp)$/i
        .test(oldThumbnail)
    ) {
      const oldCoverGithubPath =
        oldThumbnail.replace(/^\//, "");

      const oldCoverUrl =
        `https://api.github.com/repos/` +
        `${owner}/${repo}/contents/` +
        `${oldCoverGithubPath}`;

      const oldCoverResponse =
        await fetch(
          `${oldCoverUrl}?ref=${encodeURIComponent(branch)}`,
          { headers: githubHeaders }
        );

      if (oldCoverResponse.ok) {
        const oldCoverFile =
          await oldCoverResponse.json();

        const deleteResponse =
          await fetch(
            oldCoverUrl,
            {
              method: "DELETE",
              headers: {
                ...githubHeaders,
                "content-type":
                  "application/json"
              },
              body: JSON.stringify({
                message:
                  `Remove old Project ${projectNumber} cover`,
                sha: oldCoverFile.sha,
                branch
              })
            }
          );

        oldCoverDeleted =
          deleteResponse.ok;

        if (!deleteResponse.ok) {
          warning =
            "บันทึกข้อมูลแล้ว แต่ลบรูปปกเดิมไม่สำเร็จ";
        }
      }
      else if (
        oldCoverResponse.status !== 404
      ) {
        warning =
          "บันทึกข้อมูลแล้ว แต่ตรวจสอบรูปปกเดิมไม่สำเร็จ";
      }
    }
    else if (
      hasNewCover &&
      removeOldCover &&
      oldCoverStillUsed
    ) {
      warning =
        "เก็บรูปเดิมไว้ เพราะยังถูกใช้เป็นภาพหลักของหน้าโครงการ";
    }

    return json({
      ok: true,
      number: projectNumber,
      title,
      category,
      cover:
        coverWebPath || oldThumbnail,
      oldCoverDeleted,
      warning
    });
  }
  catch (error) {
    return json(
      {
        ok: false,
        error:
          error?.message ||
          "Unknown error"
      },
      500
    );
  }
}


export async function onRequestDelete({
  request,
  env
}) {
  try {
    const adminKey =
      request.headers.get(
        "x-admin-key"
      );

    if (
      !env.ADMIN_KEY ||
      adminKey !== env.ADMIN_KEY
    ) {
      return json(
        {
          ok: false,
          error: "Unauthorized"
        },
        401
      );
    }

    const body =
      await request.json();

    const projectNumber =
      String(
        body?.projectNumber || ""
      ).trim();

    const confirmTitle =
      String(
        body?.confirmTitle || ""
      ).trim();

    if (
      !/^\d{2}$/.test(projectNumber) ||
      !confirmTitle
    ) {
      return json(
        {
          ok: false,
          error:
            "ข้อมูลยืนยันการลบไม่ครบถ้วน"
        },
        400
      );
    }

    const owner =
      env.GITHUB_OWNER;

    const repo =
      env.GITHUB_REPO;

    const branch =
      env.GITHUB_BRANCH || "main";

    const token =
      env.GITHUB_TOKEN;

    if (
      !owner ||
      !repo ||
      !token
    ) {
      return json(
        {
          ok: false,
          error:
            "GitHub environment variables missing"
        },
        500
      );
    }

    const githubHeaders = {
      Authorization:
        `Bearer ${token}`,

      Accept:
        "application/vnd.github+json",

      "X-GitHub-Api-Version":
        "2022-11-28",

      "User-Agent":
        "ARSTINLA-Project-Manager"
    };

    const dataUrl =
      `https://api.github.com/repos/` +
      `${owner}/${repo}/contents/` +
      `project-data.js`;

    const readProjectData = async () => {
      const response =
        await fetch(
          `${dataUrl}?ref=${encodeURIComponent(branch)}`,
          {
            headers: githubHeaders
          }
        );

      if (!response.ok) {
        return {
          response,
          dataFile: null,
          source: ""
        };
      }

      const dataFile =
        await response.json();

      return {
        response,
        dataFile,
        source:
          decodeBase64(
            dataFile.content
          )
      };
    };

    const removeProject = source => {
      const projectRange =
        findProjectBlock(
          source,
          projectNumber
        );

      if (!projectRange) {
        return null;
      }

      const title =
        readProjectString(
          projectRange.block,
          "title"
        );

      return {
        title,
        source:
          source.slice(
            0,
            projectRange.start
          ) +
          source.slice(
            projectRange.end
          )
      };
    };

    let current =
      await readProjectData();

    if (!current.response.ok) {
      const details =
        await current.response.text();

      return json(
        {
          ok: false,
          error:
            "Cannot read project-data.js",
          status:
            current.response.status,
          details
        },
        500
      );
    }

    let removal =
      removeProject(current.source);

    if (!removal) {
      return json(
        {
          ok: false,
          error:
            "ไม่พบโครงการที่ต้องการลบ"
        },
        404
      );
    }

    if (removal.title !== confirmTitle) {
      return json(
        {
          ok: false,
          error:
            "ชื่อโครงการไม่ตรงกับข้อมูลล่าสุด กรุณารีเฟรชหน้าแล้วลองใหม่"
        },
        409
      );
    }

    const updateProjectData = async (
      dataFile,
      updatedSource
    ) =>
      fetch(
        dataUrl,
        {
          method: "PUT",

          headers: {
            ...githubHeaders,
            "content-type":
              "application/json"
          },

          body: JSON.stringify({
            message:
              `Delete Project: ${confirmTitle}`,

            content:
              bytesToBase64(
                new TextEncoder()
                  .encode(updatedSource)
              ),

            sha:
              dataFile.sha,

            branch
          })
        }
      );

    let updateResponse =
      await updateProjectData(
        current.dataFile,
        removal.source
      );

    if (
      !updateResponse.ok &&
      [409, 422].includes(
        updateResponse.status
      )
    ) {
      current =
        await readProjectData();

      if (current.response.ok) {
        removal =
          removeProject(current.source);

        if (
          removal &&
          removal.title === confirmTitle
        ) {
          updateResponse =
            await updateProjectData(
              current.dataFile,
              removal.source
            );
        }
      }
    }

    if (!updateResponse.ok) {
      const details =
        await updateResponse.text();

      return json(
        {
          ok: false,
          error:
            "ลบโครงการไม่สำเร็จ",
          status:
            updateResponse.status,
          details
        },
        500
      );
    }

    return json({
      ok: true,
      number: projectNumber,
      title: confirmTitle,
      assetsPreserved: true
    });
  }
  catch (error) {
    return json(
      {
        ok: false,
        error:
          error?.message ||
          "Unknown error"
      },
      500
    );
  }
}


async function completeProjectCreation({
  dataResponse,
  title,
  category,
  location,
  slug,
  cover,
  owner,
  repo,
  branch,
  githubHeaders
}) {
  try {
    const dataFile =
  await dataResponse.json();
const source =
  decodeBase64(
    dataFile.content
  );
    /* ------------------------------
       NEXT PROJECT NUMBER
    ------------------------------ */

    const numbers = [
      ...source.matchAll(
        /^\s*"(\d{2})"\s*:\s*\{/gm
      )
    ].map(
      match =>
        Number(match[1])
    );


    const nextNumber =
      String(
        (Math.max(0, ...numbers) + 1)
      ).padStart(2, "0");


    const coverWebPath =
      `/assets/project-${nextNumber}.jpg`;

    const assetFolder =
      `/assets/project-${nextNumber}/`;


    /* ------------------------------
       CATEGORY LABEL
    ------------------------------ */

    const categoryLabels = {
      residential:
        "Residential",

      "tiny-house":
        "Tiny House",

      commercial:
        "Commercial",

      public:
        "Public & Institutional",

      urban:
        "Urban",

      interior:
        "Interior",

      consult:
        "Consult"
    };


    const categoryLabel =
      categoryLabels[category] ||
      category;


    /* ------------------------------
       BUILD PROJECT DATA
    ------------------------------ */

    const projectBlock = `
  "${nextNumber}": {

    number: ${safeString(nextNumber)},

    slug: ${safeString(slug)},

    url:
      ${safeString(`/projects/${slug}/`)},

    title:
      ${safeString(title)},

    officialTitle:
      ${safeString(title)},

    category:
      ${safeString(categoryLabel)},

    filterCategory:
      ${safeString(category)},

    location:
      ${safeString(location)},

    province: "",

    country:
      "Thailand",

    year: "",

    completion: "",

    area: "",

    areaNumber: 0,

    status:
      "Draft",

    service:
      "Architecture / Design",

    thumbnail:
      ${safeString(coverWebPath)},

    hero:
      ${safeString(coverWebPath)},

    heroAlt:
      ${safeString(title)},

    assetFolder:
      ${safeString(assetFolder)},

    siteImages: [],

    planImages: [],

    constructionImages: [],

    previous: null,

    next: null

  }`;


    /* ------------------------------
       FIND DATABASE END

       PROJECT HELPER FUNCTIONS
       อยู่หลัง database
    ------------------------------ */

    const helperIndex =
      source.indexOf(
        "PROJECT HELPER FUNCTIONS"
      );


    if (helperIndex === -1) {
      return json(
        {
          ok: false,
          error:
            "Project helper marker not found"
        },
        500
      );
    }


    const objectCloseIndex =
      source.lastIndexOf(
        "\n};",
        helperIndex
      );


    if (objectCloseIndex === -1) {
      return json(
        {
          ok: false,
          error:
            "Project database closing not found"
        },
        500
      );
    }


    const before =
      source
        .slice(
          0,
          objectCloseIndex
        )
        .replace(/\s*$/, "");


    const after =
      source.slice(
        objectCloseIndex
      );


    const updatedSource =
      `${before},\n\n` +
      `${projectBlock}\n` +
      `${after}`;


    /* ------------------------------
       UPLOAD COVER IMAGE
    ------------------------------ */

    const coverBytes =
      new Uint8Array(
        await cover.arrayBuffer()
      );


    const coverGithubPath =
      `assets/project-${nextNumber}.jpg`;


    const coverUploadUrl =
      `https://api.github.com/repos/` +
      `${owner}/${repo}/contents/` +
      `${coverGithubPath}`;
let existingCoverSha = null;

const existingCoverResponse =
  await fetch(
    `${coverUploadUrl}?ref=${encodeURIComponent(branch)}`,
    {
      headers: githubHeaders
    }
  );

if (existingCoverResponse.ok) {
  const existingCover =
    await existingCoverResponse.json();

  existingCoverSha =
    existingCover.sha;
}

const coverPayload = {
  message:
    `Add Project ${nextNumber} cover image`,

  content:
    bytesToBase64(
      coverBytes
    ),

  branch
};

if (existingCoverSha) {
  coverPayload.sha =
    existingCoverSha;
}

const coverUpload =
  await fetch(
    coverUploadUrl,
    {
      method: "PUT",

      headers: {
        ...githubHeaders,
        "content-type":
          "application/json"
      },

      body:
        JSON.stringify(
          coverPayload
        )
    }
  );
    if (!coverUpload.ok) {

      const details =
        await coverUpload.text();

      return json(
        {
          ok: false,
          error:
            "Cover upload failed",
          details
        },
        500
      );
    }


    /* ------------------------------
       UPDATE project-data.js
    ------------------------------ */

    const updatedBytes =
      new TextEncoder()
        .encode(updatedSource);


    let updateResponse =
      await fetch(
        `https://api.github.com/repos/` +
        `${owner}/${repo}/contents/` +
        `project-data.js`,
        {
          method: "PUT",

          headers: {
            ...githubHeaders,
            "content-type":
              "application/json"
          },

          body: JSON.stringify({
            message:
              `Add Project ${nextNumber}: ${title}`,

            content:
              bytesToBase64(
                updatedBytes
              ),

            sha:
              dataFile.sha,

            branch
          })
        }
      );


    if (
      !updateResponse.ok &&
      [409, 422].includes(
        updateResponse.status
      )
    ) {
      const latestDataResponse =
        await fetch(
          `https://api.github.com/repos/` +
          `${owner}/${repo}/contents/` +
          `project-data.js` +
          `?ref=${encodeURIComponent(branch)}`,
          {
            headers: githubHeaders
          }
        );

      if (latestDataResponse.ok) {
        const latestDataFile =
          await latestDataResponse.json();

        const latestSource =
          decodeBase64(
            latestDataFile.content
          );

        const latestHelperIndex =
          latestSource.indexOf(
            "PROJECT HELPER FUNCTIONS"
          );

        const latestObjectCloseIndex =
          latestSource.lastIndexOf(
            "\n};",
            latestHelperIndex
          );

        const projectAlreadyExists =
          new RegExp(
            `^\\s*"${nextNumber}"\\s*:\\s*\\{`,
            "m"
          ).test(latestSource);

        if (
          latestHelperIndex !== -1 &&
          latestObjectCloseIndex !== -1 &&
          !projectAlreadyExists
        ) {
          const latestBefore =
            latestSource
              .slice(
                0,
                latestObjectCloseIndex
              )
              .replace(/\s*$/, "");

          const latestAfter =
            latestSource.slice(
              latestObjectCloseIndex
            );

          const retrySource =
            `${latestBefore},\n\n` +
            `${projectBlock}\n` +
            `${latestAfter}`;

          updateResponse =
            await fetch(
              `https://api.github.com/repos/` +
              `${owner}/${repo}/contents/` +
              `project-data.js`,
              {
                method: "PUT",

                headers: {
                  ...githubHeaders,
                  "content-type":
                    "application/json"
                },

                body: JSON.stringify({
                  message:
                    `Add Project ${nextNumber}: ${title}`,

                  content:
                    bytesToBase64(
                      new TextEncoder()
                        .encode(retrySource)
                    ),

                  sha:
                    latestDataFile.sha,

                  branch
                })
              }
            );
        }
      }
    }


    if (!updateResponse.ok) {

      const details =
        await updateResponse.text();

      return json(
        {
          ok: false,
          error:
            "project-data.js update failed",
          details
        },
        500
      );
    }


    return json({
      ok: true,
      number: nextNumber,
      title,
      slug,
      category,
      cover: coverWebPath
    });

  }
  catch (error) {

    return json(
      {
        ok: false,
        error:
          error?.message ||
          "Unknown error"
      },
      500
    );

  }

}
