import { PLAPI, PLExtAPI, PLExtension } from "paperlib-api/api";
import { PaperEntity } from "paperlib-api/model";
import { stringUtils } from "paperlib-api/utils";
import stringSimilarity from "string-similarity";

class PaperlibCitationCountExtension extends PLExtension {
  disposeCallbacks: (() => void)[];

  constructor() {
    super({
      id: "@future-scholars/paperlib-citation-count-extension",
      defaultPreference: {},
    });

    this.disposeCallbacks = [];
  }

  async initialize() {
    await PLExtAPI.extensionPreferenceService.register(
      this.id,
      this.defaultPreference
    );

    this.disposeCallbacks.push(
      PLAPI.uiStateService.onChanged("selectedPaperEntities", (newValues) => {
        if (newValues.value.length === 1) {
          this.getCitationCount(newValues.value[0]);
        }
      })
    );
  }

  async dispose() {
    for (const disposeCallback of this.disposeCallbacks) {
      disposeCallback();
    }

    PLExtAPI.extensionPreferenceService.unregister(this.id);
  }

  async getCitationCount(paperEntity: PaperEntity) {
    await PLAPI.uiSlotService.updateSlot("paperDetailsPanelSlot1", {
      "paperlib-citation-count": {
        title: "Citation Count",
        content: `N/A (N/A)`,
      },
    });

    let scrapeURL;
    if (paperEntity.doi !== "") {
      scrapeURL = `https://api.semanticscholar.org/graph/v1/paper/${paperEntity.doi}?fields=title,citationCount,influentialCitationCount`;
    } else if (paperEntity.arxiv !== "") {
      scrapeURL = `https://api.semanticscholar.org/graph/v1/paper/arXiv:${
        paperEntity.arxiv.toLowerCase().replace("arxiv:", "").split("v")[0]
      }?fields=title,citationCount,influentialCitationCount`;
    } else {
      scrapeURL = `https://api.semanticscholar.org/graph/v1/paper/search?query=${stringUtils.formatString(
        {
          str: paperEntity.title,
          whiteSymbol: true,
        }
      )}&limit=10&fields=title,citationCount,influentialCitationCount`;
    }

    try {
      const response = await PLAPI.networkTool.get(
        scrapeURL,
        {},
        1,
        5000,
        true
      );
      const parsedResponse = JSON.parse(response.body);

      const citationCount = {
        semanticscholarId: "",
        citationCount: "N/A",
        influentialCitationCount: "N/A",
      };

      let itemList;
      if (parsedResponse.data) {
        itemList = parsedResponse.data;
      } else {
        itemList = [parsedResponse];
      }

      for (const item of itemList) {
        const plainHitTitle = stringUtils.formatString({
          str: item.title,
          removeStr: "&amp;",
          removeSymbol: true,
          lowercased: true,
        });

        const existTitle = stringUtils.formatString({
          str: paperEntity.title,
          removeStr: "&amp;",
          removeSymbol: true,
          lowercased: true,
        });

        const sim = stringSimilarity.compareTwoStrings(
          plainHitTitle,
          existTitle
        );
        if (sim > 0.95) {
          citationCount.citationCount = `${item.citationCount}`;
          citationCount.influentialCitationCount = `${item.influentialCitationCount}`;

          break;
        }
      }

      PLAPI.uiSlotService.updateSlot("paperDetailsPanelSlot1", {
        "paperlib-citation-count": {
          title: "Citation Count",
          content: `${citationCount.citationCount} (${citationCount.influentialCitationCount})`,
        },
      });
    } catch (err) {
      if ((err as Error).message === "Response code 404 (Not Found)") {
        return;
      }

      PLAPI.logService.error(
        "Failed to get citation count.",
        err as Error,
        false,
        "CitationCountExt"
      );
    }
  }
}

async function initialize() {
  const extension = new PaperlibCitationCountExtension();
  await extension.initialize();

  return extension;
}

export { initialize };
